package zone

import (
	"testing"

	"github.com/grindset/server/internal/protocol"
)

func TestHasAllInputs(t *testing.T) {
	var inv [28]protocol.InventorySlot
	inv[0] = protocol.InventorySlot{Slot: 0, ItemDefID: "ore_copper", Qty: 5}
	inv[1] = protocol.InventorySlot{Slot: 1, ItemDefID: "ore_coal", Qty: 1}

	if !hasAllInputs(&inv, []string{"ore_copper", "ore_coal"}) {
		t.Fatal("expected both inputs present")
	}
	if hasAllInputs(&inv, []string{"ore_iron"}) {
		t.Fatal("expected ore_iron missing")
	}
	if !hasAllInputs(&inv, []string{}) {
		t.Fatal("empty needed list should be vacuously true")
	}
}

func TestConsumeInputsRemovesOneOfEach(t *testing.T) {
	var inv [28]protocol.InventorySlot
	inv[0] = protocol.InventorySlot{Slot: 0, ItemDefID: "ore_copper", Qty: 3}
	inv[1] = protocol.InventorySlot{Slot: 1, ItemDefID: "ore_coal", Qty: 1}

	changed := consumeInputs(&inv, []string{"ore_copper", "ore_coal"})

	if len(changed) != 2 {
		t.Fatalf("changed slots: got %d want 2", len(changed))
	}
	if inv[0].Qty != 2 || inv[0].ItemDefID != "ore_copper" {
		t.Fatalf("copper: got %+v", inv[0])
	}
	// Coal had qty=1, should now be empty slot.
	if inv[1].ItemDefID != "" || inv[1].Qty != 0 {
		t.Fatalf("coal slot not cleared: got %+v", inv[1])
	}
}

func TestSmithingStartFailsWithoutInputs(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	// Furnace seeded by loadNodes — find one.
	var furnaceID uint32
	z.mu.Lock()
	for _, n := range z.nodes {
		if n.DefID == "furnace_bronze" {
			furnaceID = n.ID
			break
		}
	}
	z.mu.Unlock()
	if furnaceID == 0 {
		t.Skip("no furnace_bronze in seed")
	}

	z.StartSkillAction(p.ID, furnaceID)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.Action != nil {
		t.Fatal("smithing started without inputs in inventory")
	}
}

func TestSmithingStartSucceedsWithInputs(t *testing.T) {
	z := newTestZone()
	p, _ := z.Join("alice")

	z.mu.Lock()
	addInventoryItem(&p.Inventory, "ore_copper", 5)
	addInventoryItem(&p.Inventory, "ore_coal", 5)
	var furnaceID uint32
	for _, n := range z.nodes {
		if n.DefID == "furnace_bronze" {
			furnaceID = n.ID
			break
		}
	}
	z.mu.Unlock()
	if furnaceID == 0 {
		t.Skip("no furnace_bronze in seed")
	}

	z.StartSkillAction(p.ID, furnaceID)

	z.mu.Lock()
	defer z.mu.Unlock()
	if p.Action == nil {
		t.Fatal("smithing did not start despite inputs present")
	}
	if p.ActionNodeID != furnaceID {
		t.Fatalf("ActionNodeID: got %d want %d", p.ActionNodeID, furnaceID)
	}
}
