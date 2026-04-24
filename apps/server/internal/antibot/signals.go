// Package antibot collects per-account behavioral signals, scores them hourly,
// and decides on a response action. No global state — construct via New().
package antibot

import (
	"math"
	"sync"
	"time"

	"github.com/google/uuid"
)

const ringSize = 4096 // max actions retained per account

// ActionRecord is one observed player action stored in the ring buffer.
type ActionRecord struct {
	At         time.Time
	ActionType string
	X, Y       float64
}

// Signals is the computed hourly aggregate for one account.
type Signals struct {
	AccountID    uuid.UUID
	Window       time.Time // truncated to the hour
	ActionCount  int
	ClickVariance float64 // stddev of inter-action gaps (seconds)
	PathEntropy   float64 // Shannon entropy of move-direction octants
	SessionShape  bool    // true = player took a >5-min break in the window
	FlagScore    int
}

// ring is a fixed-size circular buffer of ActionRecords.
type ring struct {
	buf  [ringSize]ActionRecord
	head int
	size int
}

func (r *ring) push(a ActionRecord) {
	r.buf[r.head%ringSize] = a
	r.head++
	if r.size < ringSize {
		r.size++
	}
}

// slice returns records in chronological order (oldest first).
func (r *ring) slice() []ActionRecord {
	n := r.size
	out := make([]ActionRecord, n)
	start := r.head - n
	for i := 0; i < n; i++ {
		out[i] = r.buf[(start+i)%ringSize]
	}
	return out
}

// Collector holds all per-account ring buffers. Thread-safe.
type Collector struct {
	mu      sync.Mutex
	rings   map[uuid.UUID]*ring
}

// NewCollector constructs an empty Collector.
func NewCollector() *Collector {
	return &Collector{rings: make(map[uuid.UUID]*ring)}
}

// Record appends one action to the account's ring buffer.
func (c *Collector) Record(accountID uuid.UUID, a ActionRecord) {
	c.mu.Lock()
	defer c.mu.Unlock()
	r := c.rings[accountID]
	if r == nil {
		r = &ring{}
		c.rings[accountID] = r
	}
	r.push(a)
}

// Compute derives hourly Signals for accountID from all actions in the ring
// that fall within [window, window+1h).
func (c *Collector) Compute(accountID uuid.UUID, window time.Time) Signals {
	c.mu.Lock()
	r := c.rings[accountID]
	var all []ActionRecord
	if r != nil {
		all = r.slice()
	}
	c.mu.Unlock()

	s := Signals{AccountID: accountID, Window: window}
	if r == nil {
		return s
	}

	end := window.Add(time.Hour)
	var acts []ActionRecord
	for _, a := range all {
		if !a.At.Before(window) && a.At.Before(end) {
			acts = append(acts, a)
		}
	}
	s.ActionCount = len(acts)
	if s.ActionCount < 2 {
		return s
	}

	s.ClickVariance = interActionStddev(acts)
	s.PathEntropy = directionEntropy(acts)
	s.SessionShape = hasBreak(acts, 5*time.Minute)
	return s
}

// interActionStddev returns the standard deviation of gap durations (seconds).
func interActionStddev(acts []ActionRecord) float64 {
	if len(acts) < 2 {
		return 0
	}
	gaps := make([]float64, len(acts)-1)
	for i := 1; i < len(acts); i++ {
		gaps[i-1] = acts[i].At.Sub(acts[i-1].At).Seconds()
	}
	mean := 0.0
	for _, g := range gaps {
		mean += g
	}
	mean /= float64(len(gaps))
	variance := 0.0
	for _, g := range gaps {
		d := g - mean
		variance += d * d
	}
	variance /= float64(len(gaps))
	return math.Sqrt(variance)
}

// directionEntropy bins move vectors into 8 compass octants and returns
// the Shannon entropy (bits) of the distribution.
func directionEntropy(acts []ActionRecord) float64 {
	if len(acts) < 2 {
		return 0
	}
	var counts [8]int
	total := 0
	for i := 1; i < len(acts); i++ {
		dx := acts[i].X - acts[i-1].X
		dy := acts[i].Y - acts[i-1].Y
		if dx == 0 && dy == 0 {
			continue
		}
		angle := math.Atan2(dy, dx) // -π..π
		octant := int((angle+math.Pi)/(math.Pi/4)) % 8
		counts[octant]++
		total++
	}
	if total == 0 {
		return 0
	}
	entropy := 0.0
	for _, c := range counts {
		if c == 0 {
			continue
		}
		p := float64(c) / float64(total)
		entropy -= p * math.Log2(p)
	}
	return entropy
}

// hasBreak returns true if any consecutive gap exceeds threshold.
func hasBreak(acts []ActionRecord, threshold time.Duration) bool {
	for i := 1; i < len(acts); i++ {
		if acts[i].At.Sub(acts[i-1].At) > threshold {
			return true
		}
	}
	return false
}
