// Package inventory manages the 28-slot player inventory and unlimited bank.
// Stackable items accumulate quantity in a single slot; non-stackable each
// occupy one slot.  All mutations are in-memory; the zone snapshot flushes to DB.
package inventory

import "errors"

const InventorySlots = 28

var (
	ErrFull       = errors.New("inventory: no free slot")
	ErrNotFound   = errors.New("inventory: item not found")
	ErrBadSlot    = errors.New("inventory: invalid slot")
	ErrBadQty     = errors.New("inventory: invalid quantity")
)

// Item is a single inventory/bank entry.
type Item struct {
	ItemDefID  string
	Quantity   int
	Stackable  bool
	// Attributes and durability omitted here; persisted via DB snapshot.
}

// Inventory is a fixed 28-slot container.
type Inventory struct {
	slots [InventorySlots]*Item
}

// Add attempts to add qty of itemDefID.  Returns the slot index used, or ErrFull.
func (inv *Inventory) Add(defID string, qty int, stackable bool) (int, error) {
	if qty <= 0 {
		return -1, ErrBadQty
	}
	if stackable {
		// Try to stack onto an existing slot.
		for i, s := range inv.slots {
			if s != nil && s.ItemDefID == defID {
				inv.slots[i].Quantity += qty
				return i, nil
			}
		}
	}
	// Find first empty slot.
	for i, s := range inv.slots {
		if s == nil {
			inv.slots[i] = &Item{ItemDefID: defID, Quantity: qty, Stackable: stackable}
			return i, nil
		}
	}
	return -1, ErrFull
}

// Remove removes qty from the item at slot.  Clears the slot if quantity reaches 0.
func (inv *Inventory) Remove(slot, qty int) error {
	if slot < 0 || slot >= InventorySlots {
		return ErrBadSlot
	}
	if qty <= 0 {
		return ErrBadQty
	}
	it := inv.slots[slot]
	if it == nil {
		return ErrNotFound
	}
	if it.Quantity < qty {
		return ErrBadQty
	}
	it.Quantity -= qty
	if it.Quantity == 0 {
		inv.slots[slot] = nil
	}
	return nil
}

// Slot returns the item at position i (nil = empty).
func (inv *Inventory) Slot(i int) *Item {
	if i < 0 || i >= InventorySlots {
		return nil
	}
	return inv.slots[i]
}

// IsFull returns true when no free slots remain.
func (inv *Inventory) IsFull() bool {
	for _, s := range inv.slots {
		if s == nil {
			return false
		}
	}
	return true
}

// Snapshot returns a copy of all slots (index → Item pointer, nil for empty).
func (inv *Inventory) Snapshot() [InventorySlots]*Item {
	return inv.slots
}

// Count returns the total quantity of defID held across all slots.
func (inv *Inventory) Count(defID string) int {
	total := 0
	for _, s := range inv.slots {
		if s != nil && s.ItemDefID == defID {
			total += s.Quantity
		}
	}
	return total
}

// Bank is an unlimited-slot container keyed by auto-incrementing slot index.
type Bank struct {
	slots map[int]*Item
	next  int
}

func NewBank() *Bank {
	return &Bank{slots: make(map[int]*Item)}
}

// Deposit moves qty of defID from inventory into the bank.
// Returns ErrNotFound if the inventory doesn't hold enough.
func (b *Bank) Deposit(inv *Inventory, defID string, qty int, stackable bool) error {
	if qty <= 0 {
		return ErrBadQty
	}
	// Find and consume from inventory.
	remaining := qty
	for i := 0; i < InventorySlots && remaining > 0; i++ {
		s := inv.slots[i]
		if s == nil || s.ItemDefID != defID {
			continue
		}
		take := s.Quantity
		if take > remaining {
			take = remaining
		}
		if err := inv.Remove(i, take); err != nil {
			return err
		}
		remaining -= take
	}
	if remaining > 0 {
		return ErrNotFound
	}
	// Add to bank (stack if stackable).
	if stackable {
		for _, bs := range b.slots {
			if bs.ItemDefID == defID {
				bs.Quantity += qty
				return nil
			}
		}
	}
	b.slots[b.next] = &Item{ItemDefID: defID, Quantity: qty, Stackable: stackable}
	b.next++
	return nil
}

// Withdraw moves qty of defID from bank into inventory.
func (b *Bank) Withdraw(inv *Inventory, defID string, qty int, stackable bool) error {
	if qty <= 0 {
		return ErrBadQty
	}
	// Find in bank.
	var found int = -1
	for k, bs := range b.slots {
		if bs.ItemDefID == defID {
			found = k
			break
		}
	}
	if found == -1 {
		return ErrNotFound
	}
	bs := b.slots[found]
	if bs.Quantity < qty {
		return ErrBadQty
	}
	if _, err := inv.Add(defID, qty, stackable); err != nil {
		return err
	}
	bs.Quantity -= qty
	if bs.Quantity == 0 {
		delete(b.slots, found)
	}
	return nil
}

// SlotCount returns the number of occupied bank slots.
func (b *Bank) SlotCount() int { return len(b.slots) }
