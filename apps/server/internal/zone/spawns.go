package zone

// loadMobs populates z.mobs. Called once during zone initialisation.
// When pool is nil (no DB), falls back to the hardcoded seed that matches
// migration 010's INSERT statements.
func (z *Zone) loadMobs(pool interface{ Ping() error }) {
	if pool != nil {
		// DB path: query mob_spawns JOIN mob_definitions for this zone.
		// Not implemented yet — gateway-wiring sprint will add pgxpool here.
		z.log.Warn("zone: DB mob loading not implemented, using hardcoded seed", "zone", z.id)
	}

	// Hardcoded fallback — mirrors migration 010 seed data
	// (incl. aggro_radius_tiles: rat=0 passive, goblin=4, bandit=6).
	seed := []struct {
		defID       string
		x, y        uint16
		hp          uint16
		respawnSecs int
		aggro       uint16
	}{
		{"marsh_rat", 12, 18, 8, 30, 0},
		{"marsh_rat", 16, 22, 8, 30, 0},
		{"marsh_rat", 28, 14, 8, 30, 0},
		{"marsh_rat", 14, 38, 8, 30, 0},
		{"bog_goblin", 35, 30, 20, 45, 4},
		{"bog_goblin", 40, 35, 20, 45, 4},
		{"bog_goblin", 8, 8, 20, 45, 4},
		{"mire_bandit", 42, 42, 35, 60, 6},
		{"mire_bandit", 6, 44, 35, 60, 6},
		// Higher-tier mobs in the SE corner — late-game content to chase.
		{"dwarf_thug", 45, 45, 60, 90, 5},
		{"dwarf_thug", 47, 38, 60, 90, 5},
		{"bog_horror", 48, 48, 100, 120, 8},
	}

	z.mu.Lock()
	defer z.mu.Unlock()
	for i, s := range seed {
		id := mobIDBase + uint32(i)
		z.mobs[id] = &Mob{
			ID:          id,
			DefID:       s.defID,
			X:           s.x,
			Y:           s.y,
			HP:          s.hp,
			MaxHP:       s.hp,
			OriginX:     s.x,
			OriginY:     s.y,
			RespawnSecs: s.respawnSecs,
			AggroRadius: s.aggro,
		}
	}
	z.log.Info("zone: mobs loaded", "count", len(z.mobs))
}
