package protocol

import "testing"

func TestCombatTargetRoundTrip(t *testing.T) {
	raw := EncodeCombatTarget(CombatTarget{EntityID: 0xCAFEBABE})
	f, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeCombatTarget(f.Payload)
	if err != nil || got.EntityID != 0xCAFEBABE {
		t.Fatalf("got %+v err %v", got, err)
	}
}

func TestCombatHitRoundTrip(t *testing.T) {
	h := CombatHit{AttackerID: 1, TargetID: 2, Damage: 14, MaxHit: 20}
	got, err := DecodeCombatHit(mustPayload(t, EncodeCombatHit(h)))
	if err != nil || got != h {
		t.Fatalf("got %+v err %v", got, err)
	}
}

func TestCombatDeathRoundTrip(t *testing.T) {
	d := CombatDeath{EntityID: 7, KillerID: 9}
	got, err := DecodeCombatDeath(mustPayload(t, EncodeCombatDeath(d)))
	if err != nil || got != d {
		t.Fatalf("mismatch")
	}
}

func TestSkillStartRoundTrip(t *testing.T) {
	got, err := DecodeSkillStart(mustPayload(t, EncodeSkillStart(SkillStart{NodeID: 42})))
	if err != nil || got.NodeID != 42 {
		t.Fatal()
	}
}

func TestSkillTickRoundTrip(t *testing.T) {
	s := SkillTick{Skill: 3, XPGained: 50, TotalXP: 12345, GrindDropped: 999_000_000_000, ItemDefID: "copper_ore"}
	got, err := DecodeSkillTick(mustPayload(t, EncodeSkillTick(s)))
	if err != nil || got != s {
		t.Fatalf("got %+v want %+v err %v", got, s, err)
	}
}

func TestSkillLevelUpRoundTrip(t *testing.T) {
	got, err := DecodeSkillLevelUp(mustPayload(t, EncodeSkillLevelUp(SkillLevelUp{Skill: 2, NewLevel: 11})))
	if err != nil || got.Skill != 2 || got.NewLevel != 11 {
		t.Fatal()
	}
}

func TestInteractRoundTrip(t *testing.T) {
	got, err := DecodeInteract(mustPayload(t, EncodeInteract(Interact{Kind: InteractKindNPC, TargetID: 100})))
	if err != nil || got.Kind != InteractKindNPC || got.TargetID != 100 {
		t.Fatal()
	}
}

func TestInventoryFullRoundTrip(t *testing.T) {
	slots := []InventorySlot{
		{Slot: 0, ItemDefID: "bronze_pickaxe", Qty: 1},
		{Slot: 1, ItemDefID: "copper_ore", Qty: 50},
		{Slot: 5, ItemDefID: "", Qty: 0},
	}
	raw := EncodeInventoryFull(slots)
	f, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	got, err := DecodeInventoryFull(f.Payload)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != len(slots) {
		t.Fatalf("len: got %d want %d", len(got), len(slots))
	}
	for i := range slots {
		if got[i] != slots[i] {
			t.Fatalf("slot %d: got %+v want %+v", i, got[i], slots[i])
		}
	}
}

func TestInventoryDeltaUsesDeltaOpcode(t *testing.T) {
	raw := EncodeInventoryDelta([]InventorySlot{{Slot: 0, ItemDefID: "rune_sword", Qty: 1}})
	if Opcode(raw[0]) != OpInventoryDelta {
		t.Fatalf("expected delta opcode, got %x", raw[0])
	}
	got, err := DecodeInventoryDelta(raw[HeaderBytes:])
	if err != nil || len(got) != 1 || got[0].ItemDefID != "rune_sword" {
		t.Fatalf("got %+v err %v", got, err)
	}
}

func TestInventoryUseRoundTrip(t *testing.T) {
	m := InventoryUse{Slot: 3, TargetKind: 1, TargetID: 99}
	got, err := DecodeInventoryUse(mustPayload(t, EncodeInventoryUse(m)))
	if err != nil || got != m {
		t.Fatal()
	}
}

func TestBankOpenCloseRoundTrip(t *testing.T) {
	got, err := DecodeBankOpenClose(mustPayload(t, EncodeBankOpenClose(BankOpenClose{State: 1})))
	if err != nil || got.State != 1 {
		t.Fatal()
	}
}

func TestBankMoveRoundTrip(t *testing.T) {
	m := BankMove{Direction: BankDirInvToBank, Src: 5, Dst: 12, Qty: 100}
	got, err := DecodeBankMove(mustPayload(t, EncodeBankMove(m)))
	if err != nil || got != m {
		t.Fatal()
	}
}

func TestChatSayRoundTrip(t *testing.T) {
	m := ChatSay{Channel: ChatChannelGlobal, Body: "ngmi lol"}
	got, err := DecodeChatSay(mustPayload(t, EncodeChatSay(m)))
	if err != nil || got != m {
		t.Fatalf("got %+v", got)
	}
}

func TestChatRecvRoundTrip(t *testing.T) {
	m := ChatRecv{Channel: 1, SenderID: 7, Sender: "gandalf", Body: "you shall not pass"}
	got, err := DecodeChatRecv(mustPayload(t, EncodeChatRecv(m)))
	if err != nil || got != m {
		t.Fatalf("got %+v", got)
	}
}

func TestWalletBalanceRoundTrip(t *testing.T) {
	w := WalletBalance{Balance: 1_500_000_000_000, Reserved: 100_000_000_000}
	got, err := DecodeWalletBalance(mustPayload(t, EncodeWalletBalance(w)))
	if err != nil || got != w {
		t.Fatal()
	}
}

func TestWalletLedgerEntryRoundTrip(t *testing.T) {
	e := WalletLedgerEntry{Delta: -50_000_000_000, Reason: "ge_fee_burn", TS: 1_700_000_000}
	got, err := DecodeWalletLedgerEntry(mustPayload(t, EncodeWalletLedgerEntry(e)))
	if err != nil || got != e {
		t.Fatalf("got %+v", got)
	}
}

func TestGeOrderPlaceRoundTrip(t *testing.T) {
	m := GeOrderPlace{Side: GeSideBuy, ItemDefID: "rune_sword", PricePerUnit: 50_000_000_000, Qty: 1}
	got, err := DecodeGeOrderPlace(mustPayload(t, EncodeGeOrderPlace(m)))
	if err != nil || got != m {
		t.Fatalf("got %+v", got)
	}
}

func TestGeOrderCancelRoundTrip(t *testing.T) {
	var id [16]byte
	for i := range id {
		id[i] = byte(i + 1)
	}
	got, err := DecodeGeOrderCancel(mustPayload(t, EncodeGeOrderCancel(GeOrderCancel{OrderID: id})))
	if err != nil || got.OrderID != id {
		t.Fatal()
	}
}

func TestGeOrderUpdateRoundTrip(t *testing.T) {
	var id [16]byte
	for i := range id {
		id[i] = byte(0x10 + i)
	}
	m := GeOrderUpdate{OrderID: id, QtyRemaining: 7, Status: GeStatusFilled, FeeBurnedSoFar: 1_234_000_000}
	got, err := DecodeGeOrderUpdate(mustPayload(t, EncodeGeOrderUpdate(m)))
	if err != nil || got != m {
		t.Fatalf("got %+v", got)
	}
}

func TestGeMarketDepthRoundTrip(t *testing.T) {
	m := GeMarketDepth{
		ItemDefID: "copper_ore",
		Levels: []GeDepthLevel{
			{Side: GeSideBuy, Price: 800_000_000, TotalQty: 200},
			{Side: GeSideSell, Price: 1_200_000_000, TotalQty: 350},
		},
	}
	got, err := DecodeGeMarketDepth(mustPayload(t, EncodeGeMarketDepth(m)))
	if err != nil || got.ItemDefID != m.ItemDefID || len(got.Levels) != len(m.Levels) {
		t.Fatalf("got %+v", got)
	}
	for i := range m.Levels {
		if got.Levels[i] != m.Levels[i] {
			t.Fatalf("level %d mismatch", i)
		}
	}
}

func TestSkillTickShortDecodeFails(t *testing.T) {
	if _, err := DecodeSkillTick([]byte{0x01}); err == nil {
		t.Fatal("expected ErrShort")
	}
}

func mustPayload(t *testing.T, raw []byte) []byte {
	t.Helper()
	f, err := Decode(raw)
	if err != nil {
		t.Fatalf("decode header: %v", err)
	}
	return f.Payload
}
