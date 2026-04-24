// Package zone owns a single zone's state: grid, entities, tick loop, broadcast.
// One goroutine runs the tick loop; inbound WS goroutines queue intents.
package zone

import (
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/grindset/server/internal/protocol"
)

const (
	viewportHalfW = 10
	viewportHalfH = 8
)

type Zone struct {
	id          string
	w, h        uint16
	tick        time.Duration
	log         *slog.Logger

	mu        sync.Mutex
	players   map[uint32]*Player
	intents   []intent
	byName    map[string]uint32
	nextID    atomic.Uint32
}

type Player struct {
	ID      uint32
	Name    string
	X, Y    uint16
	TargetX uint16
	TargetY uint16
	Outbox  chan []byte
	hasMove bool
}

type intent struct {
	pid    uint32
	targetX uint16
	targetY uint16
}

func New(id string, w, h uint16, tick time.Duration, log *slog.Logger) *Zone {
	return &Zone{
		id:      id,
		w:       w,
		h:       h,
		tick:    tick,
		log:     log,
		players: map[uint32]*Player{},
		byName:  map[string]uint32{},
	}
}

func (z *Zone) Width() uint16  { return z.w }
func (z *Zone) Height() uint16 { return z.h }

// Join adds a player; returns the player and a snapshot Welcome to send.
func (z *Zone) Join(name string) (*Player, protocol.Welcome) {
	z.mu.Lock()
	defer z.mu.Unlock()

	// if name already connected, bump existing (simple Sprint 1 policy)
	if pid, ok := z.byName[name]; ok {
		if p, ok := z.players[pid]; ok {
			close(p.Outbox)
			delete(z.players, pid)
		}
	}

	id := z.nextID.Add(1)
	spawnX := uint16(z.w / 2)
	spawnY := uint16(z.h / 2)
	p := &Player{
		ID:      id,
		Name:    name,
		X:       spawnX,
		Y:       spawnY,
		TargetX: spawnX,
		TargetY: spawnY,
		Outbox:  make(chan []byte, 64),
	}
	z.players[id] = p
	z.byName[name] = id
	return p, protocol.Welcome{
		PlayerID: id,
		SpawnX:   spawnX,
		SpawnY:   spawnY,
		ZoneW:    z.w,
		ZoneH:    z.h,
	}
}

func (z *Zone) Leave(id uint32) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if p, ok := z.players[id]; ok {
		close(p.Outbox)
		delete(z.byName, p.Name)
		delete(z.players, id)
	}
}

// QueueMove enqueues a client intent. Server re-clamps target into world bounds.
func (z *Zone) QueueMove(pid uint32, tx, ty uint16) {
	if tx >= z.w {
		tx = z.w - 1
	}
	if ty >= z.h {
		ty = z.h - 1
	}
	z.mu.Lock()
	z.intents = append(z.intents, intent{pid: pid, targetX: tx, targetY: ty})
	z.mu.Unlock()
}

// snapshot returns a copy of players' current positions for broadcasting.
// Caller must hold z.mu.
func (z *Zone) snapshotLocked() []protocol.EntityPos {
	out := make([]protocol.EntityPos, 0, len(z.players))
	for _, p := range z.players {
		out = append(out, protocol.EntityPos{ID: p.ID, X: p.X, Y: p.Y})
	}
	return out
}

func inViewport(cx, cy, x, y uint16) bool {
	dx := int(x) - int(cx)
	dy := int(y) - int(cy)
	if dx < 0 {
		dx = -dx
	}
	if dy < 0 {
		dy = -dy
	}
	return dx <= viewportHalfW && dy <= viewportHalfH
}
