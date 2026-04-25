package zone

// resolveMobMovementLocked steps each aggressive mob one tile toward the
// closest live player within its AggroRadius. Mobs without aggro are static.
// Mobs that have wandered far from their origin will path back when no player
// is in range. Caller holds z.mu.
func (z *Zone) resolveMobMovementLocked() {
	const leashFactor = 2 // mob can wander up to AggroRadius × leashFactor from origin

	for _, mob := range z.mobs {
		if mob.HP == 0 {
			continue
		}

		// Find the closest live player within aggro radius.
		var (
			target  *Player
			bestDst int = -1
		)
		if mob.AggroRadius > 0 {
			for _, pl := range z.players {
				if pl.HP == 0 {
					continue
				}
				d := chebyshev(mob.X, mob.Y, pl.X, pl.Y)
				if d > int(mob.AggroRadius) {
					continue
				}
				if bestDst < 0 || d < bestDst {
					bestDst = d
					target = pl
				}
			}
		}

		if target != nil {
			// Stop pursuing once adjacent (or on same tile).
			if chebyshev(mob.X, mob.Y, target.X, target.Y) <= 1 {
				continue
			}
			stepToward(mob, target.X, target.Y)
			continue
		}

		// Leash: drift back to origin if too far.
		leash := int(mob.AggroRadius) * leashFactor
		if leash == 0 {
			continue
		}
		if chebyshev(mob.X, mob.Y, mob.OriginX, mob.OriginY) > leash {
			stepToward(mob, mob.OriginX, mob.OriginY)
		}
	}
}

// stepToward moves the mob one tile (4-directional) toward (tx, ty).
func stepToward(m *Mob, tx, ty uint16) {
	dx := int(tx) - int(m.X)
	dy := int(ty) - int(m.Y)
	if abs(dx) >= abs(dy) {
		if dx > 0 {
			m.X++
		} else if dx < 0 {
			m.X--
		}
	} else {
		if dy > 0 {
			m.Y++
		} else if dy < 0 {
			m.Y--
		}
	}
}

func chebyshev(ax, ay, bx, by uint16) int {
	dx := int(ax) - int(bx)
	if dx < 0 {
		dx = -dx
	}
	dy := int(ay) - int(by)
	if dy < 0 {
		dy = -dy
	}
	if dx > dy {
		return dx
	}
	return dy
}
