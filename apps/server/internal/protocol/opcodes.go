package protocol

type Opcode uint8

const (
	OpHello          Opcode = 0x00
	OpWelcome        Opcode = 0x01
	OpMoveIntent     Opcode = 0x10
	OpPositionDelta  Opcode = 0x11
	OpError          Opcode = 0xF0
)

const HeaderBytes = 4 // opcode + flags + u16 length
