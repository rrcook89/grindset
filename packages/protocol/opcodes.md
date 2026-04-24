# GRINDSET Wire Protocol — Opcodes

Binary WebSocket frames. All multi-byte integers are **little-endian**.

## Frame header

```
[opcode:u8][flags:u8][length:u16 payload bytes][payload...]
```

`length` is the byte count of the payload that follows (not including the header).

## Sprint 1 opcodes

| Hex | Name | Dir | Payload |
|---|---|---|---|
| `0x00` | Hello | C→S | `dev_user_utf8` |
| `0x01` | Welcome | S→C | `player_id:u32, spawn_x:u16, spawn_y:u16, zone_w:u16, zone_h:u16` |
| `0x10` | MoveIntent | C→S | `target_x:u16, target_y:u16` |
| `0x11` | PositionDelta | S→C | `count:u16, (entity_id:u32, x:u16, y:u16) × count` |
| `0xF0` | Error | S→C | `code:u16, message_utf8` |

Sprint 1 note: the server reads `dev_user` from the WebSocket connect URL query (`?dev_user=...`) rather than from a Hello frame. The `0x00 Hello` opcode is reserved for Sprint 2 when real auth lands.

## Opcode ranges (future)

| Range | Category |
|---|---|
| `0x00–0x0F` | auth / session |
| `0x10–0x2F` | movement |
| `0x30–0x4F` | combat |
| `0x50–0x6F` | skilling / interaction |
| `0x70–0x8F` | inventory / trade |
| `0x90–0x9F` | chat |
| `0xA0–0xAF` | wallet / economy |
| `0xF0–0xFF` | system / error |

## Design rules

- Server-authoritative. Clients send **intents**, not state.
- Payloads are fixed-layout where possible. Variable payloads (e.g. chat, names) use leading length prefix.
- No JSON on the wire. Use MessagePack only if a future opcode genuinely needs nested structures.
- All length fields are `u16` (payload ≤ 64 KiB). Larger blobs get a dedicated opcode pair with chunking.
