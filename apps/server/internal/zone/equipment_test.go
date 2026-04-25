package zone

import "testing"

func TestEquipItemMovesWeaponIntoSlot(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	addInventoryItem(&p.Inventory, "iron_axe", 1)
	z.mu.Unlock()

	z.EquipItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.EquippedWeapon != "iron_axe" {
		t.Fatalf("EquippedWeapon: got %q want iron_axe", p.EquippedWeapon)
	}
	if p.Inventory[0].ItemDefID != "" {
		t.Fatalf("inventory slot should be empty after equip: %+v", p.Inventory[0])
	}
}

func TestEquipItemSwapsPreviousBackToInventory(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	p.EquippedWeapon = "bronze_dagger"
	addInventoryItem(&p.Inventory, "steel_sword", 1)
	z.mu.Unlock()

	z.EquipItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.EquippedWeapon != "steel_sword" {
		t.Fatalf("EquippedWeapon: got %q want steel_sword", p.EquippedWeapon)
	}
	// Old weapon should be back in slot 0.
	if p.Inventory[0].ItemDefID != "bronze_dagger" || p.Inventory[0].Qty != 1 {
		t.Fatalf("previous weapon not swapped back: %+v", p.Inventory[0])
	}
}

func TestEquipItemRejectsNonWeapon(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	addInventoryItem(&p.Inventory, "ore_copper", 5)
	z.mu.Unlock()

	z.EquipItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.EquippedWeapon != "" {
		t.Fatalf("equipped non-weapon: %q", p.EquippedWeapon)
	}
	if p.Inventory[0].Qty != 5 {
		t.Fatalf("ore stack disturbed: qty=%d", p.Inventory[0].Qty)
	}
}

func TestWeaponBonusTable(t *testing.T) {
	cases := []struct {
		defID string
		want  uint16
	}{
		{"bronze_dagger", 2},
		{"iron_axe", 4},
		{"steel_sword", 6},
		{"ore_copper", 0},
		{"", 0},
	}
	for _, c := range cases {
		if got := weaponBonus(c.defID); got != c.want {
			t.Errorf("weaponBonus(%q): got %d want %d", c.defID, got, c.want)
		}
	}
}

func TestUseItemRoutesWeaponToEquip(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	addInventoryItem(&p.Inventory, "steel_sword", 1)
	z.mu.Unlock()

	z.UseItem(p.ID, 0)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.EquippedWeapon != "steel_sword" {
		t.Fatalf("UseItem on weapon should equip; got EquippedWeapon=%q", p.EquippedWeapon)
	}
}
