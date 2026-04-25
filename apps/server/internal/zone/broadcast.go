package zone

// BroadcastAll pushes a pre-encoded frame to every connected player's outbox.
// Drops silently for slow clients (same back-pressure policy as tick broadcasts).
func (z *Zone) BroadcastAll(msg []byte) {
	z.mu.Lock()
	defer z.mu.Unlock()
	for _, p := range z.players {
		select {
		case p.Outbox <- msg:
		default:
		}
	}
}

// BroadcastToZone is an alias kept for clarity at call sites that mean
// "everyone in *this* zone" rather than "every server-wide".
func (z *Zone) BroadcastToZone(msg []byte) {
	z.BroadcastAll(msg)
}

// PlayerName returns the display name for a connected player ID, or "" if not
// found. Used by chat to attribute messages.
func (z *Zone) PlayerName(id uint32) string {
	z.mu.Lock()
	defer z.mu.Unlock()
	if p, ok := z.players[id]; ok {
		return p.Name
	}
	return ""
}
