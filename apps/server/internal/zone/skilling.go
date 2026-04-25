package zone

import (
	"crypto/rand"
	"encoding/binary"
	"time"

	"github.com/grindset/server/internal/protocol"
	"github.com/grindset/server/internal/skills"
)

const grindBaseUnit int64 = 1_000_000_000 // 1 $GRIND = 1e9 base units (9 decimals)

// stackable item def IDs (ores, logs, fish, bars). Anything not listed slots
// individually. Sprint-1 hardcoded; will move to item_definitions table.
var stackable = map[string]bool{
	"ore_copper": true, "ore_iron": true, "ore_coal": true, "ore_mithril": true,
	"log_normal": true, "log_oak": true, "log_willow": true, "log_yew": true,
	"fish_raw_shrimp": true, "fish_raw_trout": true, "fish_raw_lobster": true, "fish_raw_swordfish": true,
	"fish_cooked_shrimp": true, "fish_cooked_trout": true, "fish_cooked_lobster": true, "fish_cooked_swordfish": true,
	"bronze_bar": true, "iron_bar": true, "steel_bar": true,
}

// hasAllInputs returns true if every defID in `needed` exists in the
// inventory with quantity ≥ 1. Doesn't consume.
func hasAllInputs(inv *[28]protocol.InventorySlot, needed []string) bool {
	for _, defID := range needed {
		found := false
		for i := range inv {
			if inv[i].ItemDefID == defID && inv[i].Qty >= 1 {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

// consumeInputs removes one of each defID in `needed` from the inventory.
// Returns the list of slot indices that changed (so they can be broadcast as
// an InventoryDelta). Caller should already have checked hasAllInputs.
func consumeInputs(inv *[28]protocol.InventorySlot, needed []string) []int {
	changed := make([]int, 0, len(needed))
	for _, defID := range needed {
		for i := range inv {
			if inv[i].ItemDefID == defID && inv[i].Qty >= 1 {
				inv[i].Qty--
				if inv[i].Qty == 0 {
					inv[i].ItemDefID = ""
				}
				changed = append(changed, i)
				break
			}
		}
	}
	return changed
}

// addInventoryItem stacks (or finds the first empty slot for) defID. Returns
// the slot index that was modified, or -1 if inventory is full.
func addInventoryItem(inv *[28]protocol.InventorySlot, defID string, qty uint32) int {
	if stackable[defID] {
		for i := range inv {
			if inv[i].ItemDefID == defID {
				inv[i].Qty += qty
				inv[i].Slot = uint8(i)
				return i
			}
		}
	}
	for i := range inv {
		if inv[i].ItemDefID == "" {
			inv[i].Slot = uint8(i)
			inv[i].ItemDefID = defID
			inv[i].Qty = qty
			return i
		}
	}
	return -1
}

// randInRange returns a uniform integer in [lo, hi]. Uses crypto/rand for
// unpredictability per CLAUDE.md guidance.
func randInRange(lo, hi int) int {
	if hi <= lo {
		return lo
	}
	span := uint64(hi - lo + 1)
	var b [8]byte
	_, _ = rand.Read(b[:])
	return lo + int(binary.LittleEndian.Uint64(b[:])%span)
}

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
	// Recipe nodes (furnaces) require inventory inputs to even start.
	if len(def.RequiredInputs) > 0 && !hasAllInputs(&p.Inventory, def.RequiredInputs) {
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
		// Recipe nodes consume inputs from inventory on completion. If the
		// player ran out mid-action, cancel without granting XP/output.
		var consumedSlots []int
		if len(def.RequiredInputs) > 0 {
			if !hasAllInputs(&p.Inventory, def.RequiredInputs) {
				p.Action = nil
				p.ActionNodeID = 0
				continue
			}
			consumedSlots = consumeInputs(&p.Inventory, def.RequiredInputs)
		}

		newXP := oldXP + xpGained
		p.SkillXP[def.Skill] = newXP
		newLevel := skills.LevelForXP(newXP)

		// Roll a small $GRIND drop per the faucet rates in docs/04-tokenomics.md.
		// Ranges in whole $GRIND, scaled to base units. Smithing is a recipe
		// skill — drop is rarer to keep it from being a money printer.
		var grindDropped uint64
		if def.Skill == skills.Smithing {
			grindDropped = uint64(randInRange(0, 1)) * uint64(grindBaseUnit)
		} else {
			grindDropped = uint64(randInRange(0, 3)) * uint64(grindBaseUnit)
		}
		p.GrindBalance += int64(grindDropped)

		// Stack/place the produced item.
		slotIdx := addInventoryItem(&p.Inventory, itemID, 1)

		// Broadcast an InventoryDelta covering both the consumed and produced
		// slots so the client UI stays in sync.
		if len(consumedSlots) > 0 {
			payload := make([]protocol.InventorySlot, 0, len(consumedSlots))
			for _, ci := range consumedSlots {
				payload = append(payload, p.Inventory[ci])
			}
			invMsg := protocol.EncodeInventoryDelta(payload)
			select {
			case p.Outbox <- invMsg:
			default:
			}
		}

		// Broadcast a SkillTick to this player's outbox.
		tick := protocol.EncodeSkillTick(protocol.SkillTick{
			Skill:        skillIndex(def.Skill),
			XPGained:     uint16(xpGained),
			TotalXP:      uint32(newXP),
			GrindDropped: grindDropped,
			ItemDefID:    itemID,
		})
		select {
		case p.Outbox <- tick:
		default:
		}

		// Inventory delta: send just the changed slot.
		if slotIdx >= 0 {
			invMsg := protocol.EncodeInventoryDelta([]protocol.InventorySlot{p.Inventory[slotIdx]})
			select {
			case p.Outbox <- invMsg:
			default:
			}
		}

		// Wallet broadcasts: only if a drop happened (saves bandwidth).
		if grindDropped > 0 {
			balMsg := protocol.EncodeWalletBalance(protocol.WalletBalance{
				Balance:  uint64(p.GrindBalance),
				Reserved: 0,
			})
			ledgerMsg := protocol.EncodeWalletLedgerEntry(protocol.WalletLedgerEntry{
				Delta:  int64(grindDropped),
				Reason: "skill_drop:" + string(def.Skill),
				TS:     time.Now().Unix(),
			})
			select {
			case p.Outbox <- balMsg:
			default:
			}
			select {
			case p.Outbox <- ledgerMsg:
			default:
			}
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
	case skills.Cooking:
		return 6
	case skills.Smithing:
		return 7
	}
	return 255
}
