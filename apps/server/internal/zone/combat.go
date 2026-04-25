package zone

import (
	"time"

	"github.com/grindset/server/internal/protocol"
	"github.com/grindset/server/internal/skills"
)

const (
	attackIntervalTicks = 5  // ~2s at 400ms tick
	playerMaxHit        = 8  // base; gear bonuses are a later sprint
	playerAttackXP      = 50 // melee XP per kill — see docs/06-skills.md
)

// SetCombatTarget points the player at mobID and sets up movement onto its tile.
// 0 mobID clears the target.
func (z *Zone) SetCombatTarget(pid, mobID uint32) {
	z.mu.Lock()
	defer z.mu.Unlock()
	p, ok := z.players[pid]
	if !ok {
		return
	}
	if mobID == 0 {
		p.CombatTarget = 0
		return
	}
	mob, ok := z.mobs[mobID]
	if !ok {
		return
	}
	// Cancel any active skilling — combat takes precedence.
	p.Action = nil
	p.ActionNodeID = 0
	p.CombatTarget = mobID
	p.AttackCooldown = 0
	// Walk onto the mob's tile (adjacency rules are a later sprint).
	p.TargetX = mob.X
	p.TargetY = mob.Y
}

// resolveCombatLocked runs each player's active combat target. Caller holds z.mu.
func (z *Zone) resolveCombatLocked() {
	for _, p := range z.players {
		if p.CombatTarget == 0 {
			continue
		}
		mob, ok := z.mobs[p.CombatTarget]
		if !ok {
			// target gone (respawn pending or dead) → clear
			p.CombatTarget = 0
			continue
		}
		// Player must be adjacent (Chebyshev ≤ 1) before swinging.
		if !adjacentOrSame(p.X, p.Y, mob.X, mob.Y) {
			// Keep walking toward target tile (move resolution updates each tick).
			p.TargetX = mob.X
			p.TargetY = mob.Y
			continue
		}
		// Cooldown gates the swing rate.
		if p.AttackCooldown > 0 {
			p.AttackCooldown--
			continue
		}
		p.AttackCooldown = attackIntervalTicks

		// Damage roll: uniform 1..maxHit. ~10% miss baseline.
		var damage uint16
		if randInRange(0, 99) < 10 {
			damage = 0
		} else {
			damage = uint16(randInRange(1, playerMaxHit))
		}

		// Apply.
		if damage >= mob.HP {
			mob.HP = 0
		} else {
			mob.HP -= damage
		}

		// Broadcast CombatHit to the attacker (and ideally all viewers; for
		// Sprint-1 we just notify the attacker since they own the HUD).
		hitMsg := protocol.EncodeCombatHit(protocol.CombatHit{
			AttackerID: p.ID,
			TargetID:   mob.ID,
			Damage:     damage,
			MaxHit:     uint16(playerMaxHit),
		})
		select {
		case p.Outbox <- hitMsg:
		default:
		}

		// Death.
		if mob.HP == 0 {
			z.killMobLocked(p, mob)
		}
	}
}

// killMobLocked removes the mob, awards XP + drops $GRIND, broadcasts the death.
// Caller holds z.mu.
func (z *Zone) killMobLocked(p *Player, mob *Mob) {
	deathMsg := protocol.EncodeCombatDeath(protocol.CombatDeath{
		EntityID: mob.ID,
		KillerID: p.ID,
	})
	for _, viewer := range z.players {
		select {
		case viewer.Outbox <- deathMsg:
		default:
		}
	}
	delete(z.mobs, mob.ID)

	// XP for the killer.
	oldXP := p.SkillXP[skills.CombatMelee]
	oldLevel := skills.LevelForXP(oldXP)
	newXP := oldXP + playerAttackXP
	p.SkillXP[skills.CombatMelee] = newXP
	newLevel := skills.LevelForXP(newXP)

	// Loot $GRIND drop — basic per-mob-tier scaling.
	dropLo, dropHi := mobDropRange(mob.DefID)
	dropped := uint64(randInRange(dropLo, dropHi)) * uint64(grindBaseUnit)
	p.GrindBalance += int64(dropped)

	// Notify attacker: SkillTick for combat XP, wallet broadcasts.
	tick := protocol.EncodeSkillTick(protocol.SkillTick{
		Skill:        skillIndex(skills.CombatMelee),
		XPGained:     uint16(playerAttackXP),
		TotalXP:      uint32(newXP),
		GrindDropped: dropped,
		ItemDefID:    "",
	})
	select {
	case p.Outbox <- tick:
	default:
	}
	if newLevel > oldLevel {
		lvl := protocol.EncodeSkillLevelUp(protocol.SkillLevelUp{
			Skill:    skillIndex(skills.CombatMelee),
			NewLevel: uint8(newLevel),
		})
		select {
		case p.Outbox <- lvl:
		default:
		}
	}
	if dropped > 0 {
		bal := protocol.EncodeWalletBalance(protocol.WalletBalance{
			Balance:  uint64(p.GrindBalance),
			Reserved: 0,
		})
		ledger := protocol.EncodeWalletLedgerEntry(protocol.WalletLedgerEntry{
			Delta:  int64(dropped),
			Reason: "mob_kill:" + mob.DefID,
			TS:     time.Now().Unix(),
		})
		select {
		case p.Outbox <- bal:
		default:
		}
		select {
		case p.Outbox <- ledger:
		default:
		}
	}

	// Clear the target so the player stops attacking nothing.
	p.CombatTarget = 0
}

// mobDropRange returns the $GRIND drop range (whole units) for a mob def.
// Mirrors infra/migrations/010_mobs.up.sql `drop_table.grind` ranges.
func mobDropRange(defID string) (int, int) {
	switch defID {
	case "marsh_rat":
		return 3, 8
	case "bog_goblin":
		return 5, 12
	case "mire_bandit":
		return 10, 25
	case "dwarf_thug":
		return 20, 40
	case "bog_horror":
		return 60, 120
	}
	return 1, 5
}

func adjacentOrSame(ax, ay, bx, by uint16) bool {
	dx := int(ax) - int(bx)
	if dx < 0 {
		dx = -dx
	}
	dy := int(ay) - int(by)
	if dy < 0 {
		dy = -dy
	}
	return dx <= 1 && dy <= 1
}
