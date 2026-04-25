package protocol

// Codecs for opcodes added in Sprints 2-7 (combat, skills, interact, inventory,
// chat, wallet, GE). Sprint-1 codecs live in codec.go and are not changed here.

import (
	"encoding/binary"
)

// ── helpers ────────────────────────────────────────────────────────────────

// writeLPString appends a u8-length-prefixed UTF-8 string.
func writeLPString(b []byte, s string) []byte {
	if len(s) > 255 {
		s = s[:255]
	}
	b = append(b, byte(len(s)))
	b = append(b, []byte(s)...)
	return b
}

// readLPString reads a u8-length-prefixed UTF-8 string. Returns (string, rest, ok).
func readLPString(p []byte) (string, []byte, bool) {
	if len(p) < 1 {
		return "", nil, false
	}
	n := int(p[0])
	if len(p) < 1+n {
		return "", nil, false
	}
	return string(p[1 : 1+n]), p[1+n:], true
}

// ── Combat 0x30–0x32 ───────────────────────────────────────────────────────

// CombatTarget (C→S): set the active combat target. 0 = clear.
type CombatTarget struct{ EntityID uint32 }

func EncodeCombatTarget(m CombatTarget) []byte {
	p := make([]byte, 4)
	binary.LittleEndian.PutUint32(p, m.EntityID)
	return Encode(OpCombatTarget, p)
}

func DecodeCombatTarget(p []byte) (CombatTarget, error) {
	if len(p) < 4 {
		return CombatTarget{}, ErrShort
	}
	return CombatTarget{EntityID: binary.LittleEndian.Uint32(p[0:4])}, nil
}

// CombatHit (S→C): one resolved attack. Damage=0 means miss.
// TargetHP/TargetMaxHP carry the post-swing HP so the client can drive bars.
type CombatHit struct {
	AttackerID   uint32
	TargetID     uint32
	Damage       uint16
	MaxHit       uint16
	TargetHP     uint16
	TargetMaxHP  uint16
}

func EncodeCombatHit(h CombatHit) []byte {
	p := make([]byte, 16)
	binary.LittleEndian.PutUint32(p[0:4], h.AttackerID)
	binary.LittleEndian.PutUint32(p[4:8], h.TargetID)
	binary.LittleEndian.PutUint16(p[8:10], h.Damage)
	binary.LittleEndian.PutUint16(p[10:12], h.MaxHit)
	binary.LittleEndian.PutUint16(p[12:14], h.TargetHP)
	binary.LittleEndian.PutUint16(p[14:16], h.TargetMaxHP)
	return Encode(OpCombatHit, p)
}

func DecodeCombatHit(p []byte) (CombatHit, error) {
	if len(p) < 16 {
		return CombatHit{}, ErrShort
	}
	return CombatHit{
		AttackerID:  binary.LittleEndian.Uint32(p[0:4]),
		TargetID:    binary.LittleEndian.Uint32(p[4:8]),
		Damage:      binary.LittleEndian.Uint16(p[8:10]),
		MaxHit:      binary.LittleEndian.Uint16(p[10:12]),
		TargetHP:    binary.LittleEndian.Uint16(p[12:14]),
		TargetMaxHP: binary.LittleEndian.Uint16(p[14:16]),
	}, nil
}

// CombatDeath (S→C): entity died, killer optional (0 = environmental / unknown).
type CombatDeath struct {
	EntityID uint32
	KillerID uint32
}

func EncodeCombatDeath(d CombatDeath) []byte {
	p := make([]byte, 8)
	binary.LittleEndian.PutUint32(p[0:4], d.EntityID)
	binary.LittleEndian.PutUint32(p[4:8], d.KillerID)
	return Encode(OpCombatDeath, p)
}

func DecodeCombatDeath(p []byte) (CombatDeath, error) {
	if len(p) < 8 {
		return CombatDeath{}, ErrShort
	}
	return CombatDeath{
		EntityID: binary.LittleEndian.Uint32(p[0:4]),
		KillerID: binary.LittleEndian.Uint32(p[4:8]),
	}, nil
}

// ── Skills 0x50–0x53 ───────────────────────────────────────────────────────

// SkillStart (C→S): begin interaction with a skill node.
type SkillStart struct{ NodeID uint32 }

func EncodeSkillStart(m SkillStart) []byte {
	p := make([]byte, 4)
	binary.LittleEndian.PutUint32(p, m.NodeID)
	return Encode(OpSkillStart, p)
}

func DecodeSkillStart(p []byte) (SkillStart, error) {
	if len(p) < 4 {
		return SkillStart{}, ErrShort
	}
	return SkillStart{NodeID: binary.LittleEndian.Uint32(p[0:4])}, nil
}

// SkillTick (S→C): one resolved skilling tick. Empty ItemDefID = no item this tick.
type SkillTick struct {
	Skill         uint8
	XPGained      uint16
	TotalXP       uint32
	GrindDropped  uint64
	ItemDefID     string
}

func EncodeSkillTick(t SkillTick) []byte {
	buf := make([]byte, 0, 16+len(t.ItemDefID)+1)
	buf = append(buf, t.Skill)
	xp := make([]byte, 2)
	binary.LittleEndian.PutUint16(xp, t.XPGained)
	buf = append(buf, xp...)
	tx := make([]byte, 4)
	binary.LittleEndian.PutUint32(tx, t.TotalXP)
	buf = append(buf, tx...)
	g := make([]byte, 8)
	binary.LittleEndian.PutUint64(g, t.GrindDropped)
	buf = append(buf, g...)
	buf = writeLPString(buf, t.ItemDefID)
	return Encode(OpSkillTick, buf)
}

func DecodeSkillTick(p []byte) (SkillTick, error) {
	if len(p) < 15 {
		return SkillTick{}, ErrShort
	}
	t := SkillTick{
		Skill:        p[0],
		XPGained:     binary.LittleEndian.Uint16(p[1:3]),
		TotalXP:      binary.LittleEndian.Uint32(p[3:7]),
		GrindDropped: binary.LittleEndian.Uint64(p[7:15]),
	}
	id, _, ok := readLPString(p[15:])
	if !ok {
		return SkillTick{}, ErrShort
	}
	t.ItemDefID = id
	return t, nil
}

// SkillStop (C→S): empty payload.
func EncodeSkillStop() []byte               { return Encode(OpSkillStop, nil) }
func DecodeSkillStop(p []byte) (struct{}, error) { return struct{}{}, nil }

// SkillLevelUp (S→C): a player just dinged.
type SkillLevelUp struct {
	Skill    uint8
	NewLevel uint8
}

func EncodeSkillLevelUp(m SkillLevelUp) []byte {
	return Encode(OpSkillLevelUp, []byte{m.Skill, m.NewLevel})
}

func DecodeSkillLevelUp(p []byte) (SkillLevelUp, error) {
	if len(p) < 2 {
		return SkillLevelUp{}, ErrShort
	}
	return SkillLevelUp{Skill: p[0], NewLevel: p[1]}, nil
}

// ── Interact 0x60 ──────────────────────────────────────────────────────────

const (
	InteractKindNPC    = 1
	InteractKindObject = 2
)

type Interact struct {
	Kind     uint8
	TargetID uint32
}

func EncodeInteract(m Interact) []byte {
	p := make([]byte, 5)
	p[0] = m.Kind
	binary.LittleEndian.PutUint32(p[1:5], m.TargetID)
	return Encode(OpInteract, p)
}

func DecodeInteract(p []byte) (Interact, error) {
	if len(p) < 5 {
		return Interact{}, ErrShort
	}
	return Interact{Kind: p[0], TargetID: binary.LittleEndian.Uint32(p[1:5])}, nil
}

// ── Inventory 0x70–0x74 ────────────────────────────────────────────────────

type InventorySlot struct {
	Slot      uint8
	ItemDefID string // empty = empty slot
	Qty       uint32
}

// InventoryFull (S→C): replaces entire inventory state.
func EncodeInventoryFull(slots []InventorySlot) []byte {
	buf := make([]byte, 0, 1+len(slots)*8)
	buf = append(buf, byte(len(slots)))
	for _, s := range slots {
		buf = append(buf, s.Slot)
		buf = writeLPString(buf, s.ItemDefID)
		q := make([]byte, 4)
		binary.LittleEndian.PutUint32(q, s.Qty)
		buf = append(buf, q...)
	}
	return Encode(OpInventoryFull, buf)
}

func DecodeInventoryFull(p []byte) ([]InventorySlot, error) {
	if len(p) < 1 {
		return nil, ErrShort
	}
	n := int(p[0])
	rest := p[1:]
	out := make([]InventorySlot, 0, n)
	for i := 0; i < n; i++ {
		if len(rest) < 1 {
			return nil, ErrShort
		}
		slot := rest[0]
		rest = rest[1:]
		id, r, ok := readLPString(rest)
		if !ok {
			return nil, ErrShort
		}
		rest = r
		if len(rest) < 4 {
			return nil, ErrShort
		}
		qty := binary.LittleEndian.Uint32(rest[0:4])
		rest = rest[4:]
		out = append(out, InventorySlot{Slot: slot, ItemDefID: id, Qty: qty})
	}
	return out, nil
}

// InventoryDelta (S→C): same wire shape as Full; receivers patch their state.
func EncodeInventoryDelta(slots []InventorySlot) []byte {
	raw := EncodeInventoryFull(slots)
	raw[0] = byte(OpInventoryDelta)
	return raw
}
func DecodeInventoryDelta(p []byte) ([]InventorySlot, error) { return DecodeInventoryFull(p) }

// InventoryUse (C→S): use slot on target (0 = self, 1 = other slot).
type InventoryUse struct {
	Slot       uint8
	TargetKind uint8
	TargetID   uint32
}

func EncodeInventoryUse(m InventoryUse) []byte {
	p := make([]byte, 6)
	p[0] = m.Slot
	p[1] = m.TargetKind
	binary.LittleEndian.PutUint32(p[2:6], m.TargetID)
	return Encode(OpInventoryUse, p)
}

func DecodeInventoryUse(p []byte) (InventoryUse, error) {
	if len(p) < 6 {
		return InventoryUse{}, ErrShort
	}
	return InventoryUse{
		Slot:       p[0],
		TargetKind: p[1],
		TargetID:   binary.LittleEndian.Uint32(p[2:6]),
	}, nil
}

// BankOpenClose (S↔C): state 0 = closed, 1 = open.
type BankOpenClose struct{ State uint8 }

func EncodeBankOpenClose(m BankOpenClose) []byte { return Encode(OpBankOpenClose, []byte{m.State}) }
func DecodeBankOpenClose(p []byte) (BankOpenClose, error) {
	if len(p) < 1 {
		return BankOpenClose{}, ErrShort
	}
	return BankOpenClose{State: p[0]}, nil
}

// BankMove (C→S): move items between inventory and bank.
const (
	BankDirInvToBank = 0
	BankDirBankToInv = 1
	BankDirReorder   = 2
)

type BankMove struct {
	Direction uint8
	Src       uint32
	Dst       uint32
	Qty       uint32
}

func EncodeBankMove(m BankMove) []byte {
	p := make([]byte, 13)
	p[0] = m.Direction
	binary.LittleEndian.PutUint32(p[1:5], m.Src)
	binary.LittleEndian.PutUint32(p[5:9], m.Dst)
	binary.LittleEndian.PutUint32(p[9:13], m.Qty)
	return Encode(OpBankMove, p)
}

func DecodeBankMove(p []byte) (BankMove, error) {
	if len(p) < 13 {
		return BankMove{}, ErrShort
	}
	return BankMove{
		Direction: p[0],
		Src:       binary.LittleEndian.Uint32(p[1:5]),
		Dst:       binary.LittleEndian.Uint32(p[5:9]),
		Qty:       binary.LittleEndian.Uint32(p[9:13]),
	}, nil
}

// ── Chat 0x90–0x91 ─────────────────────────────────────────────────────────

const (
	ChatChannelGlobal = 0
	ChatChannelZone   = 1
	ChatChannelGuild  = 2
	ChatChannelTrade  = 3
)

// ChatSay (C→S): channel:u8, body_len:u16 LE, body_utf8
type ChatSay struct {
	Channel uint8
	Body    string
}

func EncodeChatSay(m ChatSay) []byte {
	body := []byte(m.Body)
	buf := make([]byte, 3+len(body))
	buf[0] = m.Channel
	binary.LittleEndian.PutUint16(buf[1:3], uint16(len(body)))
	copy(buf[3:], body)
	return Encode(OpChatSay, buf)
}

func DecodeChatSay(p []byte) (ChatSay, error) {
	if len(p) < 3 {
		return ChatSay{}, ErrShort
	}
	bodyLen := int(binary.LittleEndian.Uint16(p[1:3]))
	if len(p) < 3+bodyLen {
		return ChatSay{}, ErrShort
	}
	return ChatSay{
		Channel: p[0],
		Body:    string(p[3 : 3+bodyLen]),
	}, nil
}

// ChatRecv (S→C): channel:u8, sender_len:u8, sender_utf8, body_len:u16 LE, body_utf8
type ChatRecv struct {
	Channel uint8
	Sender  string
	Body    string
}

func EncodeChatRecv(m ChatRecv) []byte {
	sender := []byte(m.Sender)
	if len(sender) > 255 {
		sender = sender[:255]
	}
	body := []byte(m.Body)
	buf := make([]byte, 0, 1+1+len(sender)+2+len(body))
	buf = append(buf, m.Channel)
	buf = append(buf, byte(len(sender)))
	buf = append(buf, sender...)
	bodyLen := make([]byte, 2)
	binary.LittleEndian.PutUint16(bodyLen, uint16(len(body)))
	buf = append(buf, bodyLen...)
	buf = append(buf, body...)
	return Encode(OpChatRecv, buf)
}

func DecodeChatRecv(p []byte) (ChatRecv, error) {
	if len(p) < 4 {
		return ChatRecv{}, ErrShort
	}
	channel := p[0]
	senderLen := int(p[1])
	if len(p) < 2+senderLen+2 {
		return ChatRecv{}, ErrShort
	}
	sender := string(p[2 : 2+senderLen])
	off := 2 + senderLen
	bodyLen := int(binary.LittleEndian.Uint16(p[off : off+2]))
	off += 2
	if len(p) < off+bodyLen {
		return ChatRecv{}, ErrShort
	}
	return ChatRecv{
		Channel: channel,
		Sender:  sender,
		Body:    string(p[off : off+bodyLen]),
	}, nil
}

// ── Wallet 0xA0–0xA1 ───────────────────────────────────────────────────────

type WalletBalance struct {
	Balance  uint64
	Reserved uint64
}

func EncodeWalletBalance(w WalletBalance) []byte {
	p := make([]byte, 16)
	binary.LittleEndian.PutUint64(p[0:8], w.Balance)
	binary.LittleEndian.PutUint64(p[8:16], w.Reserved)
	return Encode(OpWalletBalance, p)
}

func DecodeWalletBalance(p []byte) (WalletBalance, error) {
	if len(p) < 16 {
		return WalletBalance{}, ErrShort
	}
	return WalletBalance{
		Balance:  binary.LittleEndian.Uint64(p[0:8]),
		Reserved: binary.LittleEndian.Uint64(p[8:16]),
	}, nil
}

type WalletLedgerEntry struct {
	Delta  int64
	Reason string
	TS     int64
}

func EncodeWalletLedgerEntry(e WalletLedgerEntry) []byte {
	buf := make([]byte, 0, 16+len(e.Reason)+1)
	d := make([]byte, 8)
	binary.LittleEndian.PutUint64(d, uint64(e.Delta))
	buf = append(buf, d...)
	t := make([]byte, 8)
	binary.LittleEndian.PutUint64(t, uint64(e.TS))
	buf = append(buf, t...)
	buf = writeLPString(buf, e.Reason)
	return Encode(OpWalletLedgerEntry, buf)
}

func DecodeWalletLedgerEntry(p []byte) (WalletLedgerEntry, error) {
	if len(p) < 16 {
		return WalletLedgerEntry{}, ErrShort
	}
	e := WalletLedgerEntry{
		Delta: int64(binary.LittleEndian.Uint64(p[0:8])),
		TS:    int64(binary.LittleEndian.Uint64(p[8:16])),
	}
	reason, _, ok := readLPString(p[16:])
	if !ok {
		return WalletLedgerEntry{}, ErrShort
	}
	e.Reason = reason
	return e, nil
}

// ── Grand Exchange 0xB0–0xB3 ───────────────────────────────────────────────

const (
	GeSideBuy  = 0
	GeSideSell = 1

	GeStatusOpen      = 0
	GeStatusFilled    = 1
	GeStatusCancelled = 2
)

type GeOrderPlace struct {
	Side         uint8
	ItemDefID    string
	PricePerUnit uint64
	Qty          uint32
}

func EncodeGeOrderPlace(m GeOrderPlace) []byte {
	buf := make([]byte, 0, 16+len(m.ItemDefID))
	buf = append(buf, m.Side)
	buf = writeLPString(buf, m.ItemDefID)
	pr := make([]byte, 8)
	binary.LittleEndian.PutUint64(pr, m.PricePerUnit)
	buf = append(buf, pr...)
	q := make([]byte, 4)
	binary.LittleEndian.PutUint32(q, m.Qty)
	buf = append(buf, q...)
	return Encode(OpGeOrderPlace, buf)
}

func DecodeGeOrderPlace(p []byte) (GeOrderPlace, error) {
	if len(p) < 1 {
		return GeOrderPlace{}, ErrShort
	}
	m := GeOrderPlace{Side: p[0]}
	id, rest, ok := readLPString(p[1:])
	if !ok {
		return GeOrderPlace{}, ErrShort
	}
	m.ItemDefID = id
	if len(rest) < 12 {
		return GeOrderPlace{}, ErrShort
	}
	m.PricePerUnit = binary.LittleEndian.Uint64(rest[0:8])
	m.Qty = binary.LittleEndian.Uint32(rest[8:12])
	return m, nil
}

type GeOrderCancel struct {
	OrderID [16]byte
}

func EncodeGeOrderCancel(m GeOrderCancel) []byte { return Encode(OpGeOrderCancel, m.OrderID[:]) }

func DecodeGeOrderCancel(p []byte) (GeOrderCancel, error) {
	if len(p) < 16 {
		return GeOrderCancel{}, ErrShort
	}
	var m GeOrderCancel
	copy(m.OrderID[:], p[0:16])
	return m, nil
}

type GeOrderUpdate struct {
	OrderID         [16]byte
	QtyRemaining    uint32
	Status          uint8
	FeeBurnedSoFar  uint64
}

func EncodeGeOrderUpdate(m GeOrderUpdate) []byte {
	p := make([]byte, 16+4+1+8)
	copy(p[0:16], m.OrderID[:])
	binary.LittleEndian.PutUint32(p[16:20], m.QtyRemaining)
	p[20] = m.Status
	binary.LittleEndian.PutUint64(p[21:29], m.FeeBurnedSoFar)
	return Encode(OpGeOrderUpdate, p)
}

func DecodeGeOrderUpdate(p []byte) (GeOrderUpdate, error) {
	if len(p) < 29 {
		return GeOrderUpdate{}, ErrShort
	}
	var m GeOrderUpdate
	copy(m.OrderID[:], p[0:16])
	m.QtyRemaining = binary.LittleEndian.Uint32(p[16:20])
	m.Status = p[20]
	m.FeeBurnedSoFar = binary.LittleEndian.Uint64(p[21:29])
	return m, nil
}

type GeDepthLevel struct {
	Side     uint8
	Price    uint64
	TotalQty uint32
}

type GeMarketDepth struct {
	ItemDefID string
	Levels    []GeDepthLevel
}

func EncodeGeMarketDepth(m GeMarketDepth) []byte {
	buf := make([]byte, 0, 1+len(m.ItemDefID)+1+13*len(m.Levels))
	buf = writeLPString(buf, m.ItemDefID)
	buf = append(buf, byte(len(m.Levels)))
	for _, l := range m.Levels {
		buf = append(buf, l.Side)
		pr := make([]byte, 8)
		binary.LittleEndian.PutUint64(pr, l.Price)
		buf = append(buf, pr...)
		q := make([]byte, 4)
		binary.LittleEndian.PutUint32(q, l.TotalQty)
		buf = append(buf, q...)
	}
	return Encode(OpGeMarketDepth, buf)
}

func DecodeGeMarketDepth(p []byte) (GeMarketDepth, error) {
	id, rest, ok := readLPString(p)
	if !ok {
		return GeMarketDepth{}, ErrShort
	}
	if len(rest) < 1 {
		return GeMarketDepth{}, ErrShort
	}
	n := int(rest[0])
	rest = rest[1:]
	if len(rest) < 13*n {
		return GeMarketDepth{}, ErrShort
	}
	out := GeMarketDepth{ItemDefID: id, Levels: make([]GeDepthLevel, n)}
	for i := 0; i < n; i++ {
		off := i * 13
		out.Levels[i] = GeDepthLevel{
			Side:     rest[off],
			Price:    binary.LittleEndian.Uint64(rest[off+1 : off+9]),
			TotalQty: binary.LittleEndian.Uint32(rest[off+9 : off+13]),
		}
	}
	return out, nil
}
