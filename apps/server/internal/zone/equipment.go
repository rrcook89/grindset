package zone

import (
	"github.com/grindset/server/internal/protocol"
)

// weaponBonus returns the maxHit bonus a weapon defID grants. Unknown items
// return 0 — they are not equippable as weapons.
func weaponBonus(defID string) uint16 {
	switch defID {
	case "bronze_dagger":
		return 2
	case "iron_axe":
		return 4
	case "steel_sword":
		return 6
	}
	return 0
}

func isWeapon(defID string) bool {
	return weaponBonus(defID) > 0
}

// EquipItem moves the weapon at `slot` into p.EquippedWeapon and pushes the
// previously equipped weapon (if any) back into the inventory. The slot is
// freed so the inventory updates atomically. Caller MUST NOT hold z.mu.
func (z *Zone) EquipItem(pid uint32, slot uint8) {
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
	if stack.ItemDefID == "" || !isWeapon(stack.ItemDefID) {
		return
	}

	// Stash the previous weapon (if any) back in the inventory slot the new
	// weapon is leaving — this is how OSRS swaps gear in one click.
	prev := p.EquippedWeapon
	p.EquippedWeapon = stack.ItemDefID
	if prev != "" {
		p.Inventory[slot] = protocol.InventorySlot{Slot: slot, ItemDefID: prev, Qty: 1}
	} else {
		p.Inventory[slot] = protocol.InventorySlot{Slot: slot}
	}

	invMsg := protocol.EncodeInventoryDelta([]protocol.InventorySlot{p.Inventory[slot]})
	select {
	case p.Outbox <- invMsg:
	default:
	}
}
