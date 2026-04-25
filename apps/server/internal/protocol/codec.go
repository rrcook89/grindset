package protocol

import (
	"encoding/binary"
	"errors"
)

var ErrShort = errors.New("protocol: short read")
var ErrBadOpcode = errors.New("protocol: bad opcode")

type Frame struct {
	Op      Opcode
	Flags   uint8
	Payload []byte
}

func Decode(buf []byte) (Frame, error) {
	if len(buf) < HeaderBytes {
		return Frame{}, ErrShort
	}
	op := Opcode(buf[0])
	flags := buf[1]
	length := binary.LittleEndian.Uint16(buf[2:4])
	if len(buf) < HeaderBytes+int(length) {
		return Frame{}, ErrShort
	}
	return Frame{Op: op, Flags: flags, Payload: buf[HeaderBytes : HeaderBytes+int(length)]}, nil
}

func Encode(op Opcode, payload []byte) []byte {
	out := make([]byte, HeaderBytes+len(payload))
	out[0] = byte(op)
	out[1] = 0
	binary.LittleEndian.PutUint16(out[2:4], uint16(len(payload)))
	copy(out[HeaderBytes:], payload)
	return out
}

// Hello: [dev_user_utf8]
type Hello struct{ DevUser string }

func DecodeHello(p []byte) Hello { return Hello{DevUser: string(p)} }
func EncodeHello(h Hello) []byte { return Encode(OpHello, []byte(h.DevUser)) }

// Welcome: [player_id:u32, spawn_x:u16, spawn_y:u16, zone_w:u16, zone_h:u16]
type Welcome struct {
	PlayerID           uint32
	SpawnX, SpawnY     uint16
	ZoneW, ZoneH       uint16
}

func EncodeWelcome(w Welcome) []byte {
	p := make([]byte, 12)
	binary.LittleEndian.PutUint32(p[0:4], w.PlayerID)
	binary.LittleEndian.PutUint16(p[4:6], w.SpawnX)
	binary.LittleEndian.PutUint16(p[6:8], w.SpawnY)
	binary.LittleEndian.PutUint16(p[8:10], w.ZoneW)
	binary.LittleEndian.PutUint16(p[10:12], w.ZoneH)
	return Encode(OpWelcome, p)
}

func DecodeWelcome(p []byte) (Welcome, error) {
	if len(p) < 12 {
		return Welcome{}, ErrShort
	}
	return Welcome{
		PlayerID: binary.LittleEndian.Uint32(p[0:4]),
		SpawnX:   binary.LittleEndian.Uint16(p[4:6]),
		SpawnY:   binary.LittleEndian.Uint16(p[6:8]),
		ZoneW:    binary.LittleEndian.Uint16(p[8:10]),
		ZoneH:    binary.LittleEndian.Uint16(p[10:12]),
	}, nil
}

// MoveIntent: [target_x:u16, target_y:u16]
type MoveIntent struct{ X, Y uint16 }

func EncodeMoveIntent(m MoveIntent) []byte {
	p := make([]byte, 4)
	binary.LittleEndian.PutUint16(p[0:2], m.X)
	binary.LittleEndian.PutUint16(p[2:4], m.Y)
	return Encode(OpMoveIntent, p)
}

func DecodeMoveIntent(p []byte) (MoveIntent, error) {
	if len(p) < 4 {
		return MoveIntent{}, ErrShort
	}
	return MoveIntent{
		X: binary.LittleEndian.Uint16(p[0:2]),
		Y: binary.LittleEndian.Uint16(p[2:4]),
	}, nil
}

// PositionDelta: [count:u16, (entity_id:u32, x:u16, y:u16, kind:u8, hp:u16, max_hp:u16) × count]
// Kind: 0 = player, 1 = mob, 2 = node. HP/MaxHP are 0 for nodes.
const (
	EntityKindPlayer uint8 = 0
	EntityKindMob    uint8 = 1
	EntityKindNode   uint8 = 2
)

const entityPosBytes = 13

type EntityPos struct {
	ID    uint32
	X, Y  uint16
	Kind  uint8
	HP    uint16
	MaxHP uint16
}

func EncodePositionDelta(entries []EntityPos) []byte {
	p := make([]byte, 2+entityPosBytes*len(entries))
	binary.LittleEndian.PutUint16(p[0:2], uint16(len(entries)))
	for i, e := range entries {
		off := 2 + i*entityPosBytes
		binary.LittleEndian.PutUint32(p[off:off+4], e.ID)
		binary.LittleEndian.PutUint16(p[off+4:off+6], e.X)
		binary.LittleEndian.PutUint16(p[off+6:off+8], e.Y)
		p[off+8] = e.Kind
		binary.LittleEndian.PutUint16(p[off+9:off+11], e.HP)
		binary.LittleEndian.PutUint16(p[off+11:off+13], e.MaxHP)
	}
	return Encode(OpPositionDelta, p)
}

func DecodePositionDelta(p []byte) ([]EntityPos, error) {
	if len(p) < 2 {
		return nil, ErrShort
	}
	n := int(binary.LittleEndian.Uint16(p[0:2]))
	if len(p) < 2+entityPosBytes*n {
		return nil, ErrShort
	}
	out := make([]EntityPos, n)
	for i := 0; i < n; i++ {
		off := 2 + i*entityPosBytes
		out[i] = EntityPos{
			ID:    binary.LittleEndian.Uint32(p[off : off+4]),
			X:     binary.LittleEndian.Uint16(p[off+4 : off+6]),
			Y:     binary.LittleEndian.Uint16(p[off+6 : off+8]),
			Kind:  p[off+8],
			HP:    binary.LittleEndian.Uint16(p[off+9 : off+11]),
			MaxHP: binary.LittleEndian.Uint16(p[off+11 : off+13]),
		}
	}
	return out, nil
}

// Error: [code:u16, message_utf8]
type ProtoError struct {
	Code    uint16
	Message string
}

func EncodeError(e ProtoError) []byte {
	p := make([]byte, 2+len(e.Message))
	binary.LittleEndian.PutUint16(p[0:2], e.Code)
	copy(p[2:], e.Message)
	return Encode(OpError, p)
}

func DecodeError(p []byte) (ProtoError, error) {
	if len(p) < 2 {
		return ProtoError{}, ErrShort
	}
	return ProtoError{
		Code:    binary.LittleEndian.Uint16(p[0:2]),
		Message: string(p[2:]),
	}, nil
}
