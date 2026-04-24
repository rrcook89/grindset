package zone

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"
)

func newTestZone() *Zone {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	return New("test", 20, 20, time.Millisecond, log)
}

func TestJoinSpawnsInCenter(t *testing.T) {
	z := newTestZone()
	p, w := z.Join("alice")
	if p.X != 10 || p.Y != 10 {
		t.Fatalf("spawn: got (%d,%d) want (10,10)", p.X, p.Y)
	}
	if w.PlayerID != p.ID || w.ZoneW != 20 || w.ZoneH != 20 {
		t.Fatalf("welcome mismatch: %+v", w)
	}
}

func TestTickAdvancesMovement(t *testing.T) {
	z := newTestZone()
	a, _ := z.Join("alice")
	b, _ := z.Join("bob")

	// alice moves toward (15, 10), bob toward (5, 10)
	z.QueueMove(a.ID, 15, 10)
	z.QueueMove(b.ID, 5, 10)

	// step manually to avoid ticker timing
	for i := 0; i < 5; i++ {
		z.step()
	}

	z.mu.Lock()
	defer z.mu.Unlock()
	if a.X != 15 || a.Y != 10 {
		t.Fatalf("alice: got (%d,%d) want (15,10)", a.X, a.Y)
	}
	if b.X != 5 || b.Y != 10 {
		t.Fatalf("bob: got (%d,%d) want (5,10)", b.X, b.Y)
	}
}

func TestIntentClampedToBounds(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	z.QueueMove(p.ID, 9999, 9999)
	for i := 0; i < 30; i++ {
		z.step()
	}
	if p.X != 19 || p.Y != 19 {
		t.Fatalf("clamp: got (%d,%d) want (19,19)", p.X, p.Y)
	}
}

func TestLeaveRemovesPlayer(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")
	z.Leave(p.ID)
	z.mu.Lock()
	defer z.mu.Unlock()
	if _, ok := z.players[p.ID]; ok {
		t.Fatal("player still present after Leave")
	}
}

func TestRunCancels(t *testing.T) {
	z := newTestZone()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { z.Run(ctx); close(done) }()
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("zone did not stop on cancel")
	}
}
