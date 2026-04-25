package zone

import (
	"github.com/grindset/server/internal/protocol"
	"github.com/grindset/server/internal/skills"
)

// StartSkillAction looks up nodeID in the zone, validates the player can use it,
// and stores an ActiveAction on the player. Idempotent if already mining the
// same node; replaces the action if a different node was active.
func (z *Zone) StartSkillAction(pid, nodeID uint32) {
	z.mu.Lock()
	defer z.mu.Unlock()

	p, ok := z.players[pid]
	if !ok {
		return
	}
	node, ok := z.nodes[nodeID]
	if !ok {
		return
	}
	def, ok := skills.Registry[node.DefID]
	if !ok {
		return
	}

	currentXP := p.SkillXP[def.Skill]
	a := skills.Start(node.DefID, currentXP)
	if a == nil {
		// level too low or unknown node
		return
	}

	p.Action = a
	p.ActionNodeID = nodeID
	p.ActionNodeX = node.X
	p.ActionNodeY = node.Y
	// Walk the player to the node so they're "in range" (adjacent works in
	// OSRS; for Sprint-1 simplicity we make the player walk onto the tile).
	p.TargetX = node.X
	p.TargetY = node.Y
}

// StopSkillAction clears any active skilling on the given player.
func (z *Zone) StopSkillAction(pid uint32) {
	z.mu.Lock()
	defer z.mu.Unlock()
	if p, ok := z.players[pid]; ok {
		p.Action = nil
		p.ActionNodeID = 0
	}
}

// resolveSkillingLocked advances each player's ActiveAction by one tick.
// Caller must hold z.mu. Pushes SkillTick (and SkillLevelUp on ding) to outbox.
func (z *Zone) resolveSkillingLocked() {
	for _, p := range z.players {
		if p.Action == nil {
			continue
		}
		// Player must be ON the node tile to skill.
		if p.X != p.ActionNodeX || p.Y != p.ActionNodeY {
			continue
		}
		def, ok := skills.Registry[p.Action.NodeID]
		if !ok {
			p.Action = nil
			continue
		}
		oldXP := p.SkillXP[def.Skill]
		oldLevel := skills.LevelForXP(oldXP)
		itemID, xpGained, _ := skills.Tick(p.Action, oldXP)
		if itemID == "" || xpGained == 0 {
			continue // still in-progress
		}
		newXP := oldXP + xpGained
		p.SkillXP[def.Skill] = newXP
		newLevel := skills.LevelForXP(newXP)

		// Broadcast a SkillTick to this player's outbox.
		tick := protocol.EncodeSkillTick(protocol.SkillTick{
			Skill:        skillIndex(def.Skill),
			XPGained:     uint16(xpGained),
			TotalXP:      uint32(newXP),
			GrindDropped: 0, // no $GRIND drop yet — wallet wiring is next
			ItemDefID:    itemID,
		})
		select {
		case p.Outbox <- tick:
		default:
		}

		if newLevel > oldLevel {
			lvl := protocol.EncodeSkillLevelUp(protocol.SkillLevelUp{
				Skill:    skillIndex(def.Skill),
				NewLevel: uint8(newLevel),
			})
			select {
			case p.Outbox <- lvl:
			default:
			}
		}
	}
}

// skillIndex maps a skill name to a stable wire index. Order matches the
// client's display order (mining=0, fishing=1, woodcutting=2, ...).
func skillIndex(n skills.Name) uint8 {
	switch n {
	case skills.Mining:
		return 0
	case skills.Fishing:
		return 1
	case skills.Woodcutting:
		return 2
	case skills.CombatMelee:
		return 3
	case skills.CombatRanged:
		return 4
	case skills.CombatMagic:
		return 5
	}
	return 255
}
