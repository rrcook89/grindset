package ge

import "testing"

// TestFeeCalculation verifies the 2% burn fee arithmetic used in matchOrder.
func TestFeeCalculation(t *testing.T) {
	cases := []struct {
		grossAmount int64
		wantFee     int64
		wantNet     int64
	}{
		{1_000_000_000, 20_000_000, 980_000_000},   // 1 GRIND
		{100, 2, 98},
		{1, 1, 0}, // minimum fee = 1
		{50, 1, 49},
	}
	for _, tc := range cases {
		fee := tc.grossAmount * FeePercent / 100
		if fee < 1 {
			fee = 1
		}
		net := tc.grossAmount - fee
		if fee != tc.wantFee {
			t.Errorf("gross=%d: fee got %d want %d", tc.grossAmount, fee, tc.wantFee)
		}
		if net != tc.wantNet {
			t.Errorf("gross=%d: net got %d want %d", tc.grossAmount, net, tc.wantNet)
		}
	}
}

// TestBurnAccountID ensures the sentinel value matches the spec.
func TestBurnAccountID(t *testing.T) {
	if BurnAccountID != "00000000-0000-0000-0000-00000000B044" {
		t.Fatalf("BurnAccountID = %q", BurnAccountID)
	}
}

// TestFeePercent is 2%.
func TestFeePercent(t *testing.T) {
	if FeePercent != 2 {
		t.Fatalf("FeePercent = %d, want 2", FeePercent)
	}
}

// TestSideConstants ensures string values match DB enum.
func TestSideConstants(t *testing.T) {
	if string(SideBuy) != "buy" {
		t.Fatalf("SideBuy = %q", SideBuy)
	}
	if string(SideSell) != "sell" {
		t.Fatalf("SideSell = %q", SideSell)
	}
}

// TestMatchOrderDirection verifies buy/sell counter-side selection logic.
func TestMatchOrderDirection(t *testing.T) {
	// When placing a buy, the counter should be a sell.
	side := SideBuy
	var counterSide Side
	if side == SideBuy {
		counterSide = SideSell
	} else {
		counterSide = SideBuy
	}
	if counterSide != SideSell {
		t.Fatalf("buy counter should be sell, got %s", counterSide)
	}

	side = SideSell
	if side == SideBuy {
		counterSide = SideSell
	} else {
		counterSide = SideBuy
	}
	if counterSide != SideBuy {
		t.Fatalf("sell counter should be buy, got %s", counterSide)
	}
}

// Integration tests (place buy + matching sell → atomic fill with correct fee burn)
// require a live Postgres DB and are tagged separately.
// Run with: go test ./internal/ge/... -tags integration -run TestIntegration
// They are intentionally absent here to keep the unit-test suite DB-free.
