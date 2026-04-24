package antibot

// flagScore returns an integer bot-likelihood score 0–100.
//
// Weights (sum to 100 at maximally-bot values):
//   - Low click variance (< 0.05 s stddev)   → up to 40 pts
//   - Low path entropy (< 0.5 bits)           → up to 35 pts
//   - No session break in the hour            → 15 pts
//   - High action count (> 1200/hr ≈ 20/min)  → up to 10 pts
func flagScore(s Signals) int {
	score := 0

	// Click variance: perfectly uniform → 40, human-like (>1.0s stddev) → 0
	if s.ClickVariance < 0.05 {
		score += 40
	} else if s.ClickVariance < 0.5 {
		// linear interpolation 40→0 over [0.05, 0.5]
		frac := (s.ClickVariance - 0.05) / (0.5 - 0.05)
		score += int(40.0 * (1.0 - frac))
	}

	// Path entropy: fully deterministic (0 bits) → 35, high entropy (>2.5 bits) → 0
	if s.PathEntropy < 0.5 {
		score += 35
	} else if s.PathEntropy < 2.5 {
		frac := (s.PathEntropy - 0.5) / (2.5 - 0.5)
		score += int(35.0 * (1.0 - frac))
	}

	// Session shape: no break → 15 pts
	if !s.SessionShape {
		score += 15
	}

	// Action count: >1200/hr → full 10 pts; linear from 600
	if s.ActionCount > 1200 {
		score += 10
	} else if s.ActionCount > 600 {
		frac := float64(s.ActionCount-600) / float64(1200-600)
		score += int(10.0 * frac)
	}

	if score > 100 {
		score = 100
	}
	return score
}
