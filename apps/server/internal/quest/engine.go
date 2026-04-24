// Package quest implements the quest state machine and event integration point.
// Call Notify(playerID, event) from combat, skills, interact, and zone packages.
package quest

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// State is the lifecycle state of a quest for one character.
type State string

const (
	StateNotStarted State = "not_started"
	StateInProgress State = "in_progress"
	StateComplete   State = "complete"
)

// EventType identifies what happened in the game world.
type EventType string

const (
	EventTalkedToNPC       EventType = "talked_to_npc"
	EventItemObtained      EventType = "item_obtained"
	EventMobKilled         EventType = "mob_killed"
	EventLocationReached   EventType = "location_reached"
	EventSkillLevelReached EventType = "skill_level_reached"
)

// Event is a game-world occurrence passed to Notify.
type Event struct {
	Type EventType

	// talked_to_npc
	NPCID string

	// item_obtained
	ItemID   string
	Quantity int

	// mob_killed
	MobID string

	// location_reached
	ZoneID string
	X, Y   int

	// skill_level_reached
	Skill string
	Level int
}

// progressData is stored in quest_progress.data as JSON.
type progressData struct {
	StepIndex int            `json:"step_index"`
	Counts    map[string]int `json:"counts,omitempty"` // step_id → accumulated count
}

// Engine drives quest state for all characters. Thread-safe.
type Engine struct {
	mu       sync.Mutex
	reg      Registry
	db       *pgxpool.Pool
	log      *slog.Logger
	// in-memory cache: characterID → questID → *progressData
	cache map[uuid.UUID]map[string]*progressData
}

// New constructs an Engine. db may be nil (in-memory only, for tests).
func New(reg Registry, db *pgxpool.Pool, log *slog.Logger) *Engine {
	return &Engine{
		reg:   reg,
		db:    db,
		log:   log,
		cache: make(map[uuid.UUID]map[string]*progressData),
	}
}

// Notify processes a game event for a character and advances any matching quests.
// It is safe to call from multiple goroutines.
func (e *Engine) Notify(ctx context.Context, characterID uuid.UUID, ev Event) {
	e.mu.Lock()
	defer e.mu.Unlock()

	for questID, def := range e.reg {
		e.advanceQuest(ctx, characterID, questID, def, ev)
	}
}

// StartQuest transitions a quest from not_started → in_progress for a character.
// Idempotent: calling on an already-started quest is a no-op.
func (e *Engine) StartQuest(ctx context.Context, characterID uuid.UUID, questID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	def, ok := e.reg[questID]
	if !ok {
		return fmt.Errorf("quest: unknown quest %q", questID)
	}
	pd := e.getOrInitProgress(characterID, questID)
	state := e.deriveState(pd, def)
	if state != StateNotStarted {
		return nil // already in progress or complete
	}
	pd.StepIndex = 0
	return e.save(ctx, characterID, questID, StateInProgress, pd)
}

// Progress returns the current state and active step index for a quest.
func (e *Engine) Progress(ctx context.Context, characterID uuid.UUID, questID string) (State, int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	def, ok := e.reg[questID]
	if !ok {
		return StateNotStarted, 0, fmt.Errorf("quest: unknown quest %q", questID)
	}
	if err := e.ensureLoaded(ctx, characterID, questID); err != nil {
		return StateNotStarted, 0, err
	}
	pd := e.getOrInitProgress(characterID, questID)
	return e.deriveState(pd, def), pd.StepIndex, nil
}

// --- internal ---

func (e *Engine) advanceQuest(ctx context.Context, characterID uuid.UUID, questID string, def *QuestDef, ev Event) {
	if err := e.ensureLoaded(ctx, characterID, questID); err != nil {
		e.log.Warn("quest: load failed", "quest", questID, "char", characterID, "err", err)
		return
	}
	pd := e.getOrInitProgress(characterID, questID)
	state := e.deriveState(pd, def)
	if state != StateInProgress {
		return
	}

	step := def.Steps[pd.StepIndex]
	if !e.eventMatchesTrigger(ev, step.Trigger) {
		return
	}

	// For counted triggers, accumulate.
	needed := triggerNeeded(step.Trigger)
	if needed > 1 {
		if pd.Counts == nil {
			pd.Counts = make(map[string]int)
		}
		pd.Counts[step.ID]++
		if pd.Counts[step.ID] < needed {
			// not yet done — save intermediate count
			_ = e.save(ctx, characterID, questID, StateInProgress, pd)
			return
		}
	}

	pd.StepIndex++
	newState := e.deriveState(pd, def)
	if err := e.save(ctx, characterID, questID, newState, pd); err != nil {
		e.log.Warn("quest: save failed", "quest", questID, "char", characterID, "err", err)
		return
	}
	e.log.Info("quest step complete", "quest", questID, "char", characterID,
		"step", step.ID, "state", newState)
}

func (e *Engine) deriveState(pd *progressData, def *QuestDef) State {
	if pd.StepIndex < 0 {
		return StateNotStarted
	}
	if pd.StepIndex >= len(def.Steps) {
		return StateComplete
	}
	return StateInProgress
}

func (e *Engine) getOrInitProgress(characterID uuid.UUID, questID string) *progressData {
	if e.cache[characterID] == nil {
		e.cache[characterID] = make(map[string]*progressData)
	}
	if e.cache[characterID][questID] == nil {
		e.cache[characterID][questID] = &progressData{StepIndex: -1}
	}
	return e.cache[characterID][questID]
}

// ensureLoaded fetches from DB if not already in cache. No-op if db is nil.
func (e *Engine) ensureLoaded(ctx context.Context, characterID uuid.UUID, questID string) error {
	if e.db == nil {
		return nil
	}
	if e.cache[characterID] != nil {
		if _, ok := e.cache[characterID][questID]; ok {
			return nil
		}
	}
	row := e.db.QueryRow(ctx,
		`SELECT state, data FROM quest_progress WHERE character_id=$1 AND quest_id=$2`,
		characterID, questID,
	)
	var stateStr string
	var raw []byte
	if err := row.Scan(&stateStr, &raw); err != nil {
		// no row → not started; leave cache uninitialised so getOrInitProgress handles it
		return nil
	}
	var pd progressData
	if err := json.Unmarshal(raw, &pd); err != nil {
		return fmt.Errorf("quest: unmarshal progress: %w", err)
	}
	if e.cache[characterID] == nil {
		e.cache[characterID] = make(map[string]*progressData)
	}
	e.cache[characterID][questID] = &pd
	return nil
}

func (e *Engine) save(ctx context.Context, characterID uuid.UUID, questID string, state State, pd *progressData) error {
	if e.db == nil {
		return nil
	}
	raw, err := json.Marshal(pd)
	if err != nil {
		return err
	}
	_, err = e.db.Exec(ctx, `
		INSERT INTO quest_progress (character_id, quest_id, state, data)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (character_id, quest_id)
		DO UPDATE SET state = EXCLUDED.state, data = EXCLUDED.data`,
		characterID, questID, string(state), raw,
	)
	return err
}

// eventMatchesTrigger returns true if ev satisfies the trigger condition.
func (e *Engine) eventMatchesTrigger(ev Event, t Trigger) bool {
	switch t.Type {
	case TriggerTalkedToNPC:
		return ev.Type == EventTalkedToNPC && ev.NPCID == t.NPCID
	case TriggerItemObtained:
		return ev.Type == EventItemObtained && ev.ItemID == t.ItemID
	case TriggerMobKilled:
		return ev.Type == EventMobKilled && ev.MobID == t.MobID
	case TriggerLocationReached:
		if ev.Type != EventLocationReached {
			return false
		}
		if t.ZoneID != "" && ev.ZoneID != t.ZoneID {
			return false
		}
		dx := ev.X - t.X
		dy := ev.Y - t.Y
		if dx < 0 {
			dx = -dx
		}
		if dy < 0 {
			dy = -dy
		}
		r := t.Radius
		if r < 1 {
			r = 1
		}
		return dx <= r && dy <= r
	case TriggerSkillLevelReached:
		return ev.Type == EventSkillLevelReached && ev.Skill == t.Skill && ev.Level >= t.Level
	}
	return false
}

// triggerNeeded returns how many times the event must fire to satisfy the trigger.
func triggerNeeded(t Trigger) int {
	switch t.Type {
	case TriggerItemObtained:
		if t.Quantity > 1 {
			return t.Quantity
		}
	case TriggerMobKilled:
		if t.Quantity > 1 {
			return t.Quantity
		}
	}
	return 1
}
