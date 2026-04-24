package wallet

import "testing"

func TestApplyCapBelowLimit(t *testing.T) {
	// 100 GRIND earned, cap = 8000 GRIND — well below, full amount passes.
	raw := int64(500) * GrindPerUnit
	earned := int64(100) * GrindPerUnit
	got := ApplyCap(raw, earned)
	if got != raw {
		t.Fatalf("below cap: got %d want %d", got, raw)
	}
}

func TestApplyCapExact(t *testing.T) {
	// Earned exactly at cap — new drop is fully diminished.
	raw := int64(1000) * GrindPerUnit
	got := ApplyCap(raw, DailyCap)
	want := int64(float64(raw) * DiminishingScale)
	if got != want {
		t.Fatalf("at cap: got %d want %d", got, want)
	}
}

func TestApplyCapPartial(t *testing.T) {
	// Earned 7900 GRIND, drop is 200 GRIND.
	// 100 GRIND passes at full rate, 100 GRIND at 20%.
	earned := int64(7900) * GrindPerUnit
	raw := int64(200) * GrindPerUnit
	got := ApplyCap(raw, earned)
	want := int64(100)*GrindPerUnit + int64(float64(100*GrindPerUnit)*DiminishingScale)
	if got != want {
		t.Fatalf("partial cap: got %d want %d", got, want)
	}
}

func TestApplyCapKicksInAt8000(t *testing.T) {
	// Simulate accumulating drops past 8000.
	var totalEarned int64
	dropPerAction := int64(8) * GrindPerUnit // 8 GRIND per action
	var effectiveTotal int64

	for i := 0; i < 2000; i++ {
		eff := ApplyCap(dropPerAction, totalEarned)
		effectiveTotal += eff
		totalEarned += eff // use effective so cap tracks correctly
	}

	// After many drops the effective total should be bounded well below
	// what uncapped would give (2000 × 8 = 16000 GRIND).
	uncapped := int64(2000) * dropPerAction
	if effectiveTotal >= uncapped {
		t.Fatalf("cap not enforced: effective=%d uncapped=%d", effectiveTotal, uncapped)
	}
	// Should be close to DailyCap + some diminished tail.
	if effectiveTotal < DailyCap {
		t.Fatalf("effective total %d should exceed DailyCap %d (diminished tail adds some)", effectiveTotal, DailyCap)
	}
}

func TestBurnAccountIDConstant(t *testing.T) {
	if BurnAccountID != "00000000-0000-0000-0000-00000000B044" {
		t.Fatalf("BurnAccountID changed: %s", BurnAccountID)
	}
}

func TestGrindPerUnit(t *testing.T) {
	if GrindPerUnit != 1_000_000_000 {
		t.Fatalf("GrindPerUnit wrong: %d", GrindPerUnit)
	}
}
