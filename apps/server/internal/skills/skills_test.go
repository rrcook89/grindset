package skills

import "testing"

func TestXPForLevel20(t *testing.T) {
	got := XPForLevel(20)
	// docs/06-skills.md: cumulative XP at level 20 ≈ 42,000
	if got < 41000 || got > 43000 {
		t.Fatalf("XPForLevel(20) = %d, want ≈42000", got)
	}
}

func TestXPForLevel1IsZero(t *testing.T) {
	if XPForLevel(1) != 0 {
		t.Fatalf("XPForLevel(1) should be 0")
	}
}

func TestLevelForXP(t *testing.T) {
	cases := []struct {
		xp    int64
		level int
	}{
		{0, 1},
		{79, 1},
		{80, 2},
		{XPForLevel(10), 10},
		{XPForLevel(20), 20},
		{XPForLevel(20) + 9999, 20}, // capped at max
	}
	for _, tc := range cases {
		got := LevelForXP(tc.xp)
		if got != tc.level {
			t.Errorf("LevelForXP(%d) = %d, want %d", tc.xp, got, tc.level)
		}
	}
}

func TestLevelUpTrigger(t *testing.T) {
	// Start just below level 2 threshold.
	xpBelow := XPForLevel(2) - 1
	a := Start("rock_copper", xpBelow)
	if a == nil {
		t.Fatal("Start returned nil")
	}
	// Drain ticks until action fires.
	var leveled bool
	var xp = xpBelow
	for i := 0; i < a.TotalTicks; i++ {
		_, gained, up := Tick(a, xp)
		xp += gained
		if up {
			leveled = true
		}
	}
	if !leveled {
		t.Fatal("expected level-up after crossing XP threshold")
	}
}

func TestTickNoYieldMidway(t *testing.T) {
	a := Start("rock_copper", 0)
	if a == nil {
		t.Fatal("Start returned nil")
	}
	// All ticks except the last should yield nothing.
	for i := 0; i < a.TotalTicks-1; i++ {
		item, xp, _ := Tick(a, 0)
		if item != "" || xp != 0 {
			t.Fatalf("tick %d: unexpected yield item=%q xp=%d", i, item, xp)
		}
	}
	// Final tick should yield.
	item, xp, _ := Tick(a, 0)
	if item == "" || xp == 0 {
		t.Fatal("expected yield on final tick")
	}
}

func TestStartLevelGate(t *testing.T) {
	// iron requires level 5; level 1 XP = 0 → should fail
	if Start("rock_iron", 0) != nil {
		t.Fatal("expected nil for under-level player")
	}
	// With enough XP for level 5 it should succeed.
	if Start("rock_iron", XPForLevel(5)) == nil {
		t.Fatal("expected non-nil for level-5 player")
	}
}

func TestStartUnknownNode(t *testing.T) {
	if Start("does_not_exist", 0) != nil {
		t.Fatal("expected nil for unknown node")
	}
}
