package zone

import (
	"github.com/grindset/server/internal/protocol"
)

// foodHeal returns how much HP a given item heals when consumed via UseItem.
// Zero means the item is not edible.
func foodHeal(defID string) uint16 {
	switch defID {
	case "fish_cooked_shrimp":
		return 3
	case "fish_cooked_trout":
		return 7
	case "fish_cooked_lobster":
		return 12
	case "fish_cooked_swordfish":
		return 18
	}
	return 0
}

// UseItem handles a player using an inventory slot on themselves. Sprint-1
// only supports edible food (TargetKind self) — other use-on-other-item
// combinations are no-ops. Caller MUST NOT hold z.mu.
func (z *Zone) UseItem(pid uint32, slot uint8) {
	z.mu.Lock()
	defer z.mu.Unlock()
	p, ok := z.players[pid]
	if !ok || p.HP == 0 {
		return
	}
	if int(slot) >= len(p.Inventory) {
		return
	}
	stack := p.Inventory[slot]
	if stack.ItemDefID == "" || stack.Qty == 0 {
		return
	}
	// Weapons get equipped instead of consumed. Release the lock and route
	// through EquipItem since it locks again.
	if isWeapon(stack.ItemDefID) {
		z.mu.Unlock()
		z.EquipItem(pid, slot)
		z.mu.Lock()
		return
	}

	heal := foodHeal(stack.ItemDefID)
	if heal == 0 {
		return // item is not edible; could extend with potions, etc.
	}

	// Apply heal, capped at MaxHP.
	newHP := p.HP + heal
	if newHP > p.MaxHP {
		newHP = p.MaxHP
	}
	p.HP = newHP

	// Consume one of the stack; clear the slot if it was the last one.
	p.Inventory[slot].Qty--
	if p.Inventory[slot].Qty == 0 {
		p.Inventory[slot].ItemDefID = ""
	}

	// Surface the heal as a CombatHit (damage=0, attacker=target=self) so
	// the client renders a green heal float and updates the HP HUD.
	hit := protocol.EncodeCombatHit(protocol.CombatHit{
		AttackerID:  p.ID,
		TargetID:    p.ID,
		Damage:      0,
		MaxHit:      0,
		TargetHP:    p.HP,
		TargetMaxHP: p.MaxHP,
	})
	select {
	case p.Outbox <- hit:
	default:
	}

	// Inventory delta for the consumed slot.
	invMsg := protocol.EncodeInventoryDelta([]protocol.InventorySlot{p.Inventory[slot]})
	select {
	case p.Outbox <- invMsg:
	default:
	}
}
