package combat

import "testing"

// fixedRoller always returns a constant value — lets us test deterministic branches.
type fixedRoller float64

func (f fixedRoller) Float64() float64 { return float64(f) }

// seqRoller returns values from a fixed sequence, cycling.
type seqRoller struct {
	vals []float64
	idx  int
}

func (s *seqRoller) Float64() float64 {
	v := s.vals[s.idx%len(s.vals)]
	s.idx++
	return v
}

func TestMaxHitSteelSwordStr10(t *testing.T) {
	// docs/05-combat.md example: level-10 strength, steel sword (85) → maxHit ≈ 14
	got := MaxHit(10, WeaponTierScalar["steel"])
	if got < 13 || got > 15 {
		t.Fatalf("MaxHit(10, steel=85) = %d, want ≈14", got)
	}
}

func TestMaxHitRunicStr20(t *testing.T) {
	// docs example: level-20 strength, runic (220) → maxHit ≈ 69
	got := MaxHit(20, WeaponTierScalar["runic"])
	if got < 68 || got > 70 {
		t.Fatalf("MaxHit(20, runic=220) = %d, want ≈69", got)
	}
}

func TestResolveHitWhenAttackerDominates(t *testing.T) {
	// With attacker roll >> defender roll, hitChance → ~1.
	// fixedRoller(0.05) gives noise = 1 + (0.05*0.2 - 0.1) = 0.91 — attacker still wins.
	// We use a sequence: first two calls are noise rolls, third is the hit-chance roll
	// (should be low so hit lands), fourth is the damage roll.
	r := &seqRoller{vals: []float64{0.05, 0.95, 0.05, 0.5}}
	result := Resolve(r, 100, 0, 0, 5, 0, 14)
	if !result.Hit {
		t.Fatal("expected hit when attacker stat >> defender stat")
	}
	if result.Damage < 1 || result.Damage > 14 {
		t.Fatalf("damage %d out of [1,14]", result.Damage)
	}
}

func TestResolveMissWhenDefenderDominates(t *testing.T) {
	// With defender roll >> attacker roll, hitChance → ~0.
	// Noise vals: attacker gets 0.9 multiplier, defender gets 1.1 multiplier.
	// hitChance = attackerRoll / (2 * defenderRoll) → very small.
	// Third val (0.9) > small hitChance → miss.
	r := &seqRoller{vals: []float64{0.0, 1.0, 0.9, 0.5}}
	result := Resolve(r, 5, 0, 0, 100, 0, 14)
	if result.Hit {
		t.Fatal("expected miss when defender stat >> attacker stat")
	}
	if result.Damage != 0 {
		t.Fatalf("damage should be 0 on miss, got %d", result.Damage)
	}
}

func TestStyleMultiplier(t *testing.T) {
	if StyleMultiplier("melee", "ranged") != 1.15 {
		t.Fatal("melee beats ranged: want 1.15")
	}
	if StyleMultiplier("ranged", "magic") != 1.15 {
		t.Fatal("ranged beats magic: want 1.15")
	}
	if StyleMultiplier("magic", "melee") != 1.15 {
		t.Fatal("magic beats melee: want 1.15")
	}
	if StyleMultiplier("melee", "magic") != 1.0 {
		t.Fatal("melee vs magic: want 1.0 (no bonus)")
	}
}

func TestRollDrops(t *testing.T) {
	// fixedRoller(0.0) < any positive chance → all drops fire.
	mob := MobRegistry["goblin"]
	drops := RollDrops(fixedRoller(0.0), mob)
	if len(drops) == 0 {
		t.Fatal("expected drops with roller=0.0")
	}
	// fixedRoller(0.99) ≥ all chances → no drops.
	drops = RollDrops(fixedRoller(0.99), mob)
	if len(drops) != 0 {
		t.Fatalf("expected no drops with roller=0.99, got %d", len(drops))
	}
}

func TestMobRegistryHasFiveStarters(t *testing.T) {
	want := []string{"rat", "goblin", "bandit", "dwarf_thug", "undead_marshfiend"}
	for _, id := range want {
		if _, ok := MobRegistry[id]; !ok {
			t.Errorf("missing mob: %s", id)
		}
	}
}
