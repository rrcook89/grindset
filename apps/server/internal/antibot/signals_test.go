package antibot

import (
	"math"
	"testing"
	"time"

	"github.com/google/uuid"
)

// uniformBot generates actions spaced exactly `gap` apart at position (x,y),
// simulating a bot that always clicks in the same spot with perfect timing.
func uniformBot(n int, gap time.Duration, x, y float64) []ActionRecord {
	acts := make([]ActionRecord, n)
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := range acts {
		acts[i] = ActionRecord{
			At:         base.Add(time.Duration(i) * gap),
			ActionType: "mine",
			X:          x,
			Y:          y,
		}
	}
	return acts
}

// jitteryHuman generates actions with random-ish gaps and direction variation.
func jitteryHuman(n int) []ActionRecord {
	acts := make([]ActionRecord, n)
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	dirs := [][2]float64{
		{1, 0}, {0, 1}, {-1, 0}, {0, -1},
		{1, 1}, {-1, 1}, {1, -1}, {-1, -1},
		{2, 1}, {1, 3}, {-2, 1}, {3, -1},
	}
	x, y := 10.0, 10.0
	for i := range acts {
		// vary gap from 0.8s to 3.2s (human-like)
		gapMs := 800 + (i%13)*200
		ts := base.Add(time.Duration(i*gapMs) * time.Millisecond)
		d := dirs[i%len(dirs)]
		x += d[0]
		y += d[1]
		acts[i] = ActionRecord{At: ts, ActionType: "move", X: x, Y: y}
	}
	return acts
}

func buildCollectorWith(acts []ActionRecord) (*Collector, uuid.UUID, time.Time) {
	col := NewCollector()
	id := uuid.New()
	window := acts[0].At.Truncate(time.Hour)
	for _, a := range acts {
		col.Record(id, a)
	}
	return col, id, window
}

func TestUniformBotHighFlagScore(t *testing.T) {
	// 1800 actions/hr, perfectly 2s apart, same position → very bot-like
	acts := uniformBot(1800, 2*time.Second, 5.0, 5.0)
	col, id, window := buildCollectorWith(acts)
	s := col.Compute(id, window)
	s.FlagScore = flagScore(s)

	if s.ClickVariance >= 0.05 {
		t.Errorf("uniform bot click variance too high: %f (want < 0.05)", s.ClickVariance)
	}
	if s.PathEntropy >= 0.5 {
		t.Errorf("uniform bot path entropy too high: %f (want < 0.5)", s.PathEntropy)
	}
	if s.SessionShape {
		t.Error("uniform bot should not have a session break")
	}
	if s.FlagScore < 60 {
		t.Errorf("uniform bot flag score too low: %d (want >= 60)", s.FlagScore)
	}
}

func TestJitteryHumanLowFlagScore(t *testing.T) {
	// 60 actions with human-like timing and varied directions
	acts := jitteryHuman(60)
	col, id, window := buildCollectorWith(acts)
	s := col.Compute(id, window)
	s.FlagScore = flagScore(s)

	if s.ClickVariance < 0.1 {
		t.Errorf("human click variance too low: %f (want >= 0.1)", s.ClickVariance)
	}
	if s.PathEntropy < 1.0 {
		t.Errorf("human path entropy too low: %f (want >= 1.0)", s.PathEntropy)
	}
	if s.FlagScore >= 60 {
		t.Errorf("human flag score too high: %d (want < 60)", s.FlagScore)
	}
}

func TestSessionBreakDetected(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	acts := []ActionRecord{
		{At: base, ActionType: "move", X: 1, Y: 1},
		{At: base.Add(1 * time.Minute), ActionType: "move", X: 2, Y: 2},
		// 10-minute gap → break detected
		{At: base.Add(11 * time.Minute), ActionType: "move", X: 3, Y: 3},
		{At: base.Add(12 * time.Minute), ActionType: "move", X: 4, Y: 4},
	}
	col, id, window := buildCollectorWith(acts)
	s := col.Compute(id, window)
	if !s.SessionShape {
		t.Error("expected SessionShape=true for >5min gap")
	}
}

func TestNoBreakForTightSession(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	acts := make([]ActionRecord, 10)
	for i := range acts {
		acts[i] = ActionRecord{At: base.Add(time.Duration(i) * time.Minute), X: float64(i), Y: 0}
	}
	col, id, window := buildCollectorWith(acts)
	s := col.Compute(id, window)
	if s.SessionShape {
		t.Error("expected SessionShape=false for gaps < 5min")
	}
}

func TestDecideEscalationLadder(t *testing.T) {
	cases := []struct {
		score int
		want  Action
	}{
		{0, ActionNone},
		{39, ActionNone},
		{40, ActionThrottle},
		{59, ActionThrottle},
		{60, ActionWithdrawFreeze},
		{74, ActionWithdrawFreeze},
		{75, ActionShadowBan},
		{89, ActionShadowBan},
		{90, ActionHardBan},
		{100, ActionHardBan},
	}
	for _, tc := range cases {
		got := Decide(tc.score)
		if got != tc.want {
			t.Errorf("Decide(%d) = %s, want %s", tc.score, got, tc.want)
		}
	}
}

func TestDirectionEntropyUniform(t *testing.T) {
	// All moves in the same direction → entropy = 0
	acts := uniformBot(100, time.Second, 0, 0)
	// Make them all move right
	for i := range acts {
		acts[i].X = float64(i)
	}
	e := directionEntropy(acts)
	if e > 0.01 {
		t.Errorf("uniform direction entropy = %f, want ~0", e)
	}
}

func TestDirectionEntropyMaximal(t *testing.T) {
	// 8 equal groups in each octant → entropy ≈ log2(8) = 3
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	angles := []float64{0, math.Pi / 4, math.Pi / 2, 3 * math.Pi / 4,
		math.Pi, -3 * math.Pi / 4, -math.Pi / 2, -math.Pi / 4}
	acts := make([]ActionRecord, 0, len(angles)*10+1)
	x, y := 0.0, 0.0
	acts = append(acts, ActionRecord{At: base, X: x, Y: y})
	i := 0
	for _, angle := range angles {
		dx := math.Cos(angle)
		dy := math.Sin(angle)
		for j := 0; j < 10; j++ {
			x += dx
			y += dy
			acts = append(acts, ActionRecord{
				At: base.Add(time.Duration(i+j+1) * time.Second),
				X:  x, Y: y,
			})
		}
		i += 10
	}
	e := directionEntropy(acts)
	if e < 2.5 {
		t.Errorf("maximal direction entropy = %f, want >= 2.5", e)
	}
}
