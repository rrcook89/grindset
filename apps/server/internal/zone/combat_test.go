package zone

import (
	"testing"
	"time"

	"github.com/grindset/server/internal/skills"
)

// addTestMob inserts a mob with known stats. Caller does NOT need to lock.
func addTestMob(z *Zone, id uint32, defID string, x, y, hp uint16, respawnSecs int) *Mob {
	z.mu.Lock()
	defer z.mu.Unlock()
	m := &Mob{
		ID:          id,
		DefID:       defID,
		X:           x,
		Y:           y,
		HP:          hp,
		MaxHP:       hp,
		OriginX:     x,
		OriginY:     y,
		RespawnSecs: respawnSecs,
	}
	z.mobs[id] = m
	return m
}

func TestKillMobAwardsXPAndDrop(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	mob := addTestMob(z, 1_000_900, "marsh_rat", 5, 5, 1, 30)

	// Spy on the player's combat target to ensure kill clears it.
	z.mu.Lock()
	p.CombatTarget = mob.ID
	beforeXP := p.SkillXP[skills.CombatMelee]
	beforeBal := p.GrindBalance
	z.killMobLocked(p, mob)
	z.mu.Unlock()

	z.mu.Lock()
	defer z.mu.Unlock()

	if p.CombatTarget != 0 {
		t.Fatalf("CombatTarget not cleared: %d", p.CombatTarget)
	}
	gainedXP := p.SkillXP[skills.CombatMelee] - beforeXP
	if gainedXP != int64(playerAttackXP) {
		t.Fatalf("melee XP gained: got %d want %d", gainedXP, playerAttackXP)
	}
	gainedGrind := p.GrindBalance - beforeBal
	loRange, hiRange := mobDropRange(mob.DefID)
	if gainedGrind < int64(loRange)*grindBaseUnit || gainedGrind > int64(hiRange)*grindBaseUnit {
		t.Fatalf("grind drop %d outside [%d, %d] base units", gainedGrind, int64(loRange)*grindBaseUnit, int64(hiRange)*grindBaseUnit)
	}
	if _, alive := z.mobs[mob.ID]; alive {
		t.Fatal("mob still in z.mobs after kill")
	}
	if len(z.pendingRespawn) != 1 {
		t.Fatalf("pendingRespawn len: got %d want 1", len(z.pendingRespawn))
	}
}

func TestKillPlayerRespawnsAtCenter(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	mob := addTestMob(z, 1_000_900, "bog_horror", 5, 5, 100, 60)

	// Move alice somewhere off-center, queue an action + target.
	z.mu.Lock()
	p.X = 3
	p.Y = 4
	p.CombatTarget = mob.ID
	p.HP = 0
	z.killPlayerLocked(p, mob.ID)
	defer z.mu.Unlock()

	if p.X != z.w/2 || p.Y != z.h/2 {
		t.Fatalf("respawn pos: got (%d,%d) want center (%d,%d)", p.X, p.Y, z.w/2, z.h/2)
	}
	if p.HP != p.MaxHP {
		t.Fatalf("respawn HP: got %d want %d", p.HP, p.MaxHP)
	}
	if p.CombatTarget != 0 {
		t.Fatalf("combat target not cleared on death")
	}
}

func TestDrainRespawnsRestoresMob(t *testing.T) {
	z := newTestZone()
	z.mu.Lock()
	z.pendingRespawn = append(z.pendingRespawn, pendingRespawn{
		id:          1_000_999,
		defID:       "marsh_rat",
		x:           5,
		y:           5,
		maxHP:       8,
		respawnSecs: 30,
		aggroRadius: 0,
		// already past due
		at: time.Now().Add(-1 * time.Second),
	})
	z.drainRespawnsLocked()
	defer z.mu.Unlock()

	mob, ok := z.mobs[1_000_999]
	if !ok {
		t.Fatal("respawned mob not in z.mobs")
	}
	if mob.HP != mob.MaxHP {
		t.Fatalf("respawned HP: got %d want %d", mob.HP, mob.MaxHP)
	}
	if len(z.pendingRespawn) != 0 {
		t.Fatalf("pendingRespawn not drained: len=%d", len(z.pendingRespawn))
	}
}

func TestSetCombatTargetCancelsSkilling(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	mob := addTestMob(z, 1_000_900, "marsh_rat", 7, 8, 8, 30)

	z.mu.Lock()
	// Pretend we were skilling.
	p.Action = &skills.ActiveAction{NodeID: "rock_copper", TicksLeft: 3, TotalTicks: 6}
	p.ActionNodeID = 2_000_000
	z.mu.Unlock()

	z.SetCombatTarget(p.ID, mob.ID)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.Action != nil {
		t.Fatal("Action not cancelled when combat target set")
	}
	if p.ActionNodeID != 0 {
		t.Fatal("ActionNodeID not cleared")
	}
	if p.CombatTarget != mob.ID {
		t.Fatalf("CombatTarget: got %d want %d", p.CombatTarget, mob.ID)
	}
	if p.TargetX != mob.X || p.TargetY != mob.Y {
		t.Fatalf("Move target: got (%d,%d) want (%d,%d)", p.TargetX, p.TargetY, mob.X, mob.Y)
	}
}

func TestMobLootRollTable(t *testing.T) {
	cases := []struct{ defID, item string; chance int }{
		{"marsh_rat", "rat_tail", 30},
		{"bog_goblin", "goblin_ear", 25},
		{"mire_bandit", "coin_pouch", 20},
		{"dwarf_thug", "dwarven_shard", 15},
		{"bog_horror", "bog_essence", 10},
		{"unknown_mob", "", 0},
	}
	for _, c := range cases {
		gotItem, gotChance := mobLootRoll(c.defID)
		if gotItem != c.item || gotChance != c.chance {
			t.Errorf("%s: got (%q, %d) want (%q, %d)", c.defID, gotItem, gotChance, c.item, c.chance)
		}
	}
}
