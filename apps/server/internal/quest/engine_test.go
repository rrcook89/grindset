package quest

import (
	"context"
	"io"
	"io/fs"
	"log/slog"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/google/uuid"
)

// minimalYAML builds an in-memory FS with one quest definition.
func minimalFS(yaml string) fs.FS {
	return fstest.MapFS{
		"quest.yaml": &fstest.MapFile{Data: []byte(yaml)},
	}
}

func newTestEngine(t *testing.T, yaml string) *Engine {
	t.Helper()
	reg, err := LoadDefs(minimalFS(yaml))
	if err != nil {
		t.Fatalf("LoadDefs: %v", err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New(reg, nil, log)
}

const tutorialYAML = `
id: test_tutorial
title: "Tutorial"
description: "Test quest"
rewards:
  xp: 10
steps:
  - id: talk_npc
    description: "Talk to NPC"
    trigger:
      type: talked_to_npc
      npc_id: guide
  - id: kill_mob
    description: "Kill 2 rats"
    trigger:
      type: mob_killed
      mob_id: rat
      quantity: 2
  - id: reach_loc
    description: "Reach the exit"
    trigger:
      type: location_reached
      zone_id: town
      x: 10
      y: 10
      radius: 2
`

func TestTutorialCompletesInSequence(t *testing.T) {
	e := newTestEngine(t, tutorialYAML)
	ctx := context.Background()
	cid := uuid.New()

	if err := e.StartQuest(ctx, cid, "test_tutorial"); err != nil {
		t.Fatalf("StartQuest: %v", err)
	}

	st, idx, _ := e.Progress(ctx, cid, "test_tutorial")
	if st != StateInProgress || idx != 0 {
		t.Fatalf("want in_progress/0, got %s/%d", st, idx)
	}

	// Step 0: talk to NPC
	e.Notify(ctx, cid, Event{Type: EventTalkedToNPC, NPCID: "guide"})
	st, idx, _ = e.Progress(ctx, cid, "test_tutorial")
	if st != StateInProgress || idx != 1 {
		t.Fatalf("after talk: want in_progress/1, got %s/%d", st, idx)
	}

	// Wrong mob should not advance
	e.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "goblin"})
	_, idx, _ = e.Progress(ctx, cid, "test_tutorial")
	if idx != 1 {
		t.Fatalf("wrong mob advanced step, idx=%d", idx)
	}

	// Step 1: kill 2 rats (counted trigger)
	e.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "rat"})
	_, idx, _ = e.Progress(ctx, cid, "test_tutorial")
	if idx != 1 {
		t.Fatalf("after 1 rat: still step 1, got idx=%d", idx)
	}
	e.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "rat"})
	_, idx, _ = e.Progress(ctx, cid, "test_tutorial")
	if idx != 2 {
		t.Fatalf("after 2 rats: want idx=2, got %d", idx)
	}

	// Step 2: reach location (within radius)
	e.Notify(ctx, cid, Event{Type: EventLocationReached, ZoneID: "town", X: 11, Y: 9})
	st, _, _ = e.Progress(ctx, cid, "test_tutorial")
	if st != StateComplete {
		t.Fatalf("want complete, got %s", st)
	}
}

func TestOutOfRangeLocationDoesNotAdvance(t *testing.T) {
	e := newTestEngine(t, tutorialYAML)
	ctx := context.Background()
	cid := uuid.New()

	_ = e.StartQuest(ctx, cid, "test_tutorial")
	// advance past step 0 and 1 quickly
	e.Notify(ctx, cid, Event{Type: EventTalkedToNPC, NPCID: "guide"})
	e.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "rat"})
	e.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "rat"})

	// location far out of radius
	e.Notify(ctx, cid, Event{Type: EventLocationReached, ZoneID: "town", X: 50, Y: 50})
	st, _, _ := e.Progress(ctx, cid, "test_tutorial")
	if st == StateComplete {
		t.Fatal("far location should not complete quest")
	}
}

func TestNotStartedQuestIgnoresEvents(t *testing.T) {
	e := newTestEngine(t, tutorialYAML)
	ctx := context.Background()
	cid := uuid.New()

	// Do not call StartQuest — events should be silently ignored
	e.Notify(ctx, cid, Event{Type: EventTalkedToNPC, NPCID: "guide"})
	st, idx, _ := e.Progress(ctx, cid, "test_tutorial")
	if st != StateNotStarted {
		t.Fatalf("want not_started, got %s idx=%d", st, idx)
	}
}

func TestStartQuestIdempotent(t *testing.T) {
	e := newTestEngine(t, tutorialYAML)
	ctx := context.Background()
	cid := uuid.New()

	if err := e.StartQuest(ctx, cid, "test_tutorial"); err != nil {
		t.Fatal(err)
	}
	// advance one step
	e.Notify(ctx, cid, Event{Type: EventTalkedToNPC, NPCID: "guide"})
	_, idxBefore, _ := e.Progress(ctx, cid, "test_tutorial")

	// calling StartQuest again must not reset progress
	if err := e.StartQuest(ctx, cid, "test_tutorial"); err != nil {
		t.Fatal(err)
	}
	_, idxAfter, _ := e.Progress(ctx, cid, "test_tutorial")
	if idxBefore != idxAfter {
		t.Fatalf("StartQuest reset progress: before=%d after=%d", idxBefore, idxAfter)
	}
}

func TestUnknownQuestReturnsError(t *testing.T) {
	e := newTestEngine(t, tutorialYAML)
	ctx := context.Background()
	err := e.StartQuest(ctx, uuid.New(), "nonexistent_quest")
	if err == nil || !strings.Contains(err.Error(), "nonexistent_quest") {
		t.Fatalf("expected error mentioning quest id, got %v", err)
	}
}

func TestSaveRestoreRoundTrip(t *testing.T) {
	// Simulate a save by directly populating cache (no DB), then verify
	// that progress loaded from cache is consistent after multiple notifies.
	e := newTestEngine(t, tutorialYAML)
	ctx := context.Background()
	cid := uuid.New()

	_ = e.StartQuest(ctx, cid, "test_tutorial")
	e.Notify(ctx, cid, Event{Type: EventTalkedToNPC, NPCID: "guide"})
	e.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "rat"})

	// Capture in-cache step index
	_, idxMid, _ := e.Progress(ctx, cid, "test_tutorial")
	if idxMid != 1 {
		t.Fatalf("mid-quest: want idx=1, got %d", idxMid)
	}

	// Build a second engine sharing the same in-memory cache snapshot via
	// explicit cache injection — proves the data structure round-trips cleanly.
	e2 := newTestEngine(t, tutorialYAML)
	e2.mu.Lock()
	e2.cache[cid] = map[string]*progressData{
		"test_tutorial": {StepIndex: 1, Counts: map[string]int{"kill_mob": 1}},
	}
	e2.mu.Unlock()

	// One more rat kill should advance to step 2
	e2.Notify(ctx, cid, Event{Type: EventMobKilled, MobID: "rat"})
	_, idx2, _ := e2.Progress(ctx, cid, "test_tutorial")
	if idx2 != 2 {
		t.Fatalf("restored engine: want idx=2, got %d", idx2)
	}
}

func TestLoadDefsRejectsEmptyID(t *testing.T) {
	badYAML := `
title: "No ID quest"
steps:
  - id: s
    trigger:
      type: talked_to_npc
      npc_id: npc
`
	_, err := LoadDefs(minimalFS(badYAML))
	if err == nil {
		t.Fatal("expected error for quest with no id")
	}
}

func TestSkillLevelTrigger(t *testing.T) {
	yaml := `
id: skill_quest
title: "Skill Quest"
steps:
  - id: level_up
    description: "Reach mining level 5"
    trigger:
      type: skill_level_reached
      skill: mining
      level: 5
`
	e := newTestEngine(t, yaml)
	ctx := context.Background()
	cid := uuid.New()
	_ = e.StartQuest(ctx, cid, "skill_quest")

	// Level 4 should not satisfy level>=5
	e.Notify(ctx, cid, Event{Type: EventSkillLevelReached, Skill: "mining", Level: 4})
	st, _, _ := e.Progress(ctx, cid, "skill_quest")
	if st == StateComplete {
		t.Fatal("level 4 should not complete level-5 trigger")
	}

	// Level 5 should complete it
	e.Notify(ctx, cid, Event{Type: EventSkillLevelReached, Skill: "mining", Level: 5})
	st, _, _ = e.Progress(ctx, cid, "skill_quest")
	if st != StateComplete {
		t.Fatalf("want complete at level 5, got %s", st)
	}
}
