package protocol

type Opcode uint8

const (
	// auth / session  0x00–0x0F
	OpHello   Opcode = 0x00
	OpWelcome Opcode = 0x01

	// movement  0x10–0x2F
	OpMoveIntent    Opcode = 0x10
	OpPositionDelta Opcode = 0x11

	// combat  0x30–0x4F
	OpCombatTarget Opcode = 0x30
	OpCombatHit    Opcode = 0x31
	OpCombatDeath  Opcode = 0x32

	// skilling / interaction  0x50–0x6F
	OpSkillStart   Opcode = 0x50
	OpSkillTick    Opcode = 0x51
	OpSkillStop    Opcode = 0x52
	OpSkillLevelUp Opcode = 0x53
	OpInteract     Opcode = 0x60

	// inventory / trade  0x70–0x8F
	OpInventoryFull  Opcode = 0x70
	OpInventoryDelta Opcode = 0x71
	OpInventoryUse   Opcode = 0x72
	OpBankOpenClose  Opcode = 0x73
	OpBankMove       Opcode = 0x74

	// chat  0x90–0x9F
	OpChatSay  Opcode = 0x90
	OpChatRecv Opcode = 0x91

	// wallet / economy  0xA0–0xAF
	OpWalletBalance     Opcode = 0xA0
	OpWalletLedgerEntry Opcode = 0xA1

	// Grand Exchange  0xB0–0xBF
	OpGeOrderPlace  Opcode = 0xB0
	OpGeOrderCancel Opcode = 0xB1
	OpGeOrderUpdate Opcode = 0xB2
	OpGeMarketDepth Opcode = 0xB3

	// system / error  0xF0–0xFF
	OpError Opcode = 0xF0
)

const HeaderBytes = 4 // opcode + flags + u16 length
