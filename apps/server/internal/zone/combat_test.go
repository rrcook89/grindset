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

// fixedRand returns a sequence of (lo+offset) values where offset rotates
// through the supplied list. Useful for forcing specific roll outcomes.
func fixedRand(values ...int) func(lo, hi int) int {
	idx := 0
	return func(lo, hi int) int {
		if hi <= lo {
			return lo
		}
		v := values[idx%len(values)]
		idx++
		// Clamp to [lo, hi].
		if v < lo {
			v = lo
		} else if v > hi {
			v = hi
		}
		return v
	}
}

func TestPlayerSwingDeterministicHit(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	mob := addTestMob(z, 1_000_900, "marsh_rat", 5, 5, 30, 30)

	// Move alice adjacent to mob and target it.
	z.mu.Lock()
	p.X = 5
	p.Y = 5
	p.CombatTarget = mob.ID
	p.AttackCooldown = 0
	beforeHP := mob.HP
	z.mu.Unlock()

	// First call → miss-roll picks 99 (>= 10, so NOT a miss).
	// Second call → damage roll within [1, playerMaxHit] = [1, 8]. Pick 5.
	// Third call → crit-roll picks 50 (>= 10, so NO crit).
	// Mobs swing first in resolveCombatLocked: mob's miss-roll(0..99)<15 ?
	//   Pick 80 = no miss. Then mob damage roll(1..3 for rat) → 1.
	// So order of randInRange calls per resolveCombatLocked tick:
	//   mob miss roll, mob damage, player miss, player damage, crit roll.
	prev := SetRandSource(fixedRand(80, 1, 99, 5, 50))
	defer SetRandSource(prev)

	z.mu.Lock()
	z.resolveCombatLocked()
	z.mu.Unlock()

	z.mu.Lock()
	defer z.mu.Unlock()
	if mob.HP != beforeHP-5 {
		t.Fatalf("expected mob HP to drop by 5; got %d → %d", beforeHP, mob.HP)
	}
}

func TestPlayerSwingHeavyStrikeTriples(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	mob := addTestMob(z, 1_000_900, "marsh_rat", 5, 5, 30, 30)

	z.mu.Lock()
	p.X = 5
	p.Y = 5
	p.CombatTarget = mob.ID
	p.AttackCooldown = 0
	p.NextSwingMul = 3 // Heavy Strike queued
	beforeHP := mob.HP
	z.mu.Unlock()

	// mob miss (80 = no miss), mob dmg 1, player miss roll 99 (no miss),
	// player damage 4, crit roll 50 (no crit). 4 × heavy-strike(3) = 12.
	prev := SetRandSource(fixedRand(80, 1, 99, 4, 50))
	defer SetRandSource(prev)

	z.mu.Lock()
	z.resolveCombatLocked()
	z.mu.Unlock()

	z.mu.Lock()
	defer z.mu.Unlock()
	if mob.HP != beforeHP-12 {
		t.Fatalf("expected Heavy Strike × 3 = 12 dmg; got HP drop %d → %d", beforeHP, mob.HP)
	}
	if p.NextSwingMul != 1 {
		t.Fatalf("NextSwingMul should reset to 1 after consuming; got %d", p.NextSwingMul)
	}
}

func TestPlayerSwingMissProduces0Damage(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	mob := addTestMob(z, 1_000_900, "marsh_rat", 5, 5, 30, 30)

	z.mu.Lock()
	p.X = 5
	p.Y = 5
	p.CombatTarget = mob.ID
	p.AttackCooldown = 0
	beforeHP := mob.HP
	z.mu.Unlock()

	// mob miss-roll 80 (no miss), mob dmg 1, player miss-roll 5 (< 10 = MISS).
	// Player misses → no further rolls consumed for damage / crit.
	prev := SetRandSource(fixedRand(80, 1, 5))
	defer SetRandSource(prev)

	z.mu.Lock()
	z.resolveCombatLocked()
	z.mu.Unlock()

	z.mu.Lock()
	defer z.mu.Unlock()
	if mob.HP != beforeHP {
		t.Fatalf("missed swing should not change mob HP: %d → %d", beforeHP, mob.HP)
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
