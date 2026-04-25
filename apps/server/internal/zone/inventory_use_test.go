package zone

import "testing"

func TestUseItemFoodHealsAndConsumes(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.HP = 50
	p.MaxHP = 100
	addInventoryItem(&p.Inventory, "fish_cooked_lobster", 2)
	z.mu.Unlock()

	z.UseItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	want := uint16(50) + foodHeal("fish_cooked_lobster")
	if p.HP != want {
		t.Fatalf("HP after eat: got %d want %d", p.HP, want)
	}
	if p.Inventory[0].ItemDefID != "fish_cooked_lobster" || p.Inventory[0].Qty != 1 {
		t.Fatalf("inventory after one eat: got %+v", p.Inventory[0])
	}
}

func TestUseItemFoodCapsAtMaxHP(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.HP = 99
	p.MaxHP = 100
	addInventoryItem(&p.Inventory, "fish_cooked_swordfish", 1) // heals 18
	z.mu.Unlock()

	z.UseItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.HP != p.MaxHP {
		t.Fatalf("HP capped: got %d want %d", p.HP, p.MaxHP)
	}
}

func TestUseItemNonEdibleNoOp(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.HP = 50
	addInventoryItem(&p.Inventory, "ore_copper", 5)
	z.mu.Unlock()

	z.UseItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.HP != 50 {
		t.Fatalf("non-edible item healed: HP=%d", p.HP)
	}
	if p.Inventory[0].Qty != 5 {
		t.Fatalf("non-edible item consumed: qty=%d", p.Inventory[0].Qty)
	}
}

func TestUseItemDeadPlayerNoOp(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.HP = 0
	addInventoryItem(&p.Inventory, "fish_cooked_shrimp", 1)
	z.mu.Unlock()

	z.UseItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.HP != 0 {
		t.Fatalf("dead player healed via UseItem: HP=%d", p.HP)
	}
}
