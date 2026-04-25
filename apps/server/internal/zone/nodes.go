package zone

// SkillNode is a static skilling node in the zone.
type SkillNode struct {
	ID    uint32
	Kind  string // "rock" | "tree" | "spot"
	DefID string // skills.Registry key e.g. "rock_copper"
	X, Y  uint16
}

// loadNodes populates z.nodes with hardcoded dev data matching the client stub.
// IDs start at nodeIDBase (2_000_000).
func (z *Zone) loadNodes() {
	static := []struct {
		kind  string
		defID string
		x, y  uint16
	}{
		// Starter cluster (level 1) — close to spawn
		{"rock", "rock_copper", 22, 22},
		{"rock", "rock_copper", 23, 23},
		{"rock", "rock_copper", 21, 25},
		{"tree", "tree_normal", 28, 20},
		{"tree", "tree_normal", 30, 22},
		{"tree", "tree_normal", 27, 27},
		{"spot", "spot_shrimp", 20, 30},
		{"spot", "spot_shrimp", 22, 32},

		// Mid tier (level 5) — slightly farther
		{"rock", "rock_iron", 24, 24},
		{"rock", "rock_iron", 18, 14},
		{"tree", "tree_oak", 32, 24},
		{"tree", "tree_oak", 35, 20},
		{"spot", "spot_trout", 16, 36},

		// Higher tier (level 10) — outskirts
		{"rock", "rock_coal", 10, 12},
		{"rock", "rock_coal", 12, 10},
		{"tree", "tree_willow", 38, 14},
		{"spot", "spot_lobster", 10, 42},

		// End-game (level 15) — corners
		{"rock", "rock_mithril", 6, 6},
		{"tree", "tree_yew", 44, 10},
		{"spot", "spot_swordfish", 8, 46},
	}

	z.mu.Lock()
	defer z.mu.Unlock()
	for i, n := range static {
		id := nodeIDBase + uint32(i)
		z.nodes[id] = &SkillNode{
			ID:    id,
			Kind:  n.kind,
			DefID: n.defID,
			X:     n.x,
			Y:     n.y,
		}
	}
	z.log.Info("zone: nodes loaded", "count", len(z.nodes))
}
