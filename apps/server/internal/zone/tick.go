package zone

import (
	"context"
	"time"

	"github.com/grindset/server/internal/protocol"
)

// Run drives the tick loop until ctx is cancelled.
func (z *Zone) Run(ctx context.Context) {
	if z.tick <= 0 {
		z.tick = 400 * time.Millisecond
	}
	ticker := time.NewTicker(z.tick)
	defer ticker.Stop()

	z.log.Info("zone running", "id", z.id, "w", z.w, "h", z.h, "tick_ms", z.tick.Milliseconds())

	for {
		select {
		case <-ctx.Done():
			z.log.Info("zone stopped", "id", z.id)
			return
		case <-ticker.C:
			z.step()
		}
	}
}

func (z *Zone) step() {
	z.mu.Lock()
	// 1. Drain intents → apply latest per player
	latest := map[uint32]intent{}
	for _, in := range z.intents {
		latest[in.pid] = in
	}
	z.intents = z.intents[:0]
	for pid, in := range latest {
		if p, ok := z.players[pid]; ok {
			p.TargetX = in.targetX
			p.TargetY = in.targetY
			p.hasMove = true
		}
	}

	// 2. Movement: step 1 tile toward target (4-directional; cheap Sprint 1 pathing)
	for _, p := range z.players {
		if p.X == p.TargetX && p.Y == p.TargetY {
			p.hasMove = false
			continue
		}
		// prefer axis with larger delta
		dx := int(p.TargetX) - int(p.X)
		dy := int(p.TargetY) - int(p.Y)
		if abs(dx) >= abs(dy) {
			if dx > 0 {
				p.X++
			} else if dx < 0 {
				p.X--
			}
		} else {
			if dy > 0 {
				p.Y++
			} else if dy < 0 {
				p.Y--
			}
		}
		p.hasMove = true
	}

	// 3. Skilling: advance ActiveActions for any player on a node tile
	z.resolveSkillingLocked()

	// 4. Broadcast: send per-viewer filtered PositionDelta
	snapshot := z.snapshotLocked()
	for _, viewer := range z.players {
		vis := make([]protocol.EntityPos, 0, len(snapshot))
		for _, e := range snapshot {
			if inViewport(viewer.X, viewer.Y, e.X, e.Y) {
				vis = append(vis, e)
			}
		}
		if len(vis) == 0 {
			continue
		}
		msg := protocol.EncodePositionDelta(vis)
		select {
		case viewer.Outbox <- msg:
		default:
			// drop: client is too slow
		}
	}
	z.mu.Unlock()
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}
