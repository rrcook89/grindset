// Binary wire protocol — all multi-byte integers little-endian.
// Frame: [u8 opcode][u8 flags][u16 length][payload...]

export const OP = {
  HELLO: 0x00,
  WELCOME: 0x01,
  MOVE_INTENT: 0x10,
  POSITION_DELTA: 0x11,
  ERROR: 0xf0,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeHeader(view: DataView, opcode: number, payloadLen: number): void {
  view.setUint8(0, opcode);
  view.setUint8(1, 0x00); // flags — reserved
  view.setUint16(2, payloadLen, true); // little-endian
}

// ── Encoders ─────────────────────────────────────────────────────────────────

/** 0x00 Hello — sent by client after WS open (dev mode skips auth) */
export function encodeHello(devUser: string): Uint8Array {
  const nameBytes = new TextEncoder().encode(devUser);
  const buf = new ArrayBuffer(4 + nameBytes.byteLength);
  const view = new DataView(buf);
  writeHeader(view, OP.HELLO, nameBytes.byteLength);
  new Uint8Array(buf).set(nameBytes, 4);
  return new Uint8Array(buf);
}

/** 0x10 MoveIntent — client tile click */
export function encodeMoveIntent(targetX: number, targetY: number): Uint8Array {
  const buf = new ArrayBuffer(4 + 4); // header + x:u16 + y:u16
  const view = new DataView(buf);
  writeHeader(view, OP.MOVE_INTENT, 4);
  view.setUint16(4, targetX, true);
  view.setUint16(6, targetY, true);
  return new Uint8Array(buf);
}

// ── Decoders ─────────────────────────────────────────────────────────────────

export interface WelcomePayload {
  playerId: number;
  spawnX: number;
  spawnY: number;
  zoneW: number;
  zoneH: number;
}

/**
 * 0x01 Welcome payload (after header):
 * player_id:u32, spawn_x:u16, spawn_y:u16, zone_w:u16, zone_h:u16  = 12 bytes
 */
export function decodeWelcome(buf: ArrayBuffer): WelcomePayload {
  const view = new DataView(buf);
  return {
    playerId: view.getUint32(4, true),
    spawnX: view.getUint16(8, true),
    spawnY: view.getUint16(10, true),
    zoneW: view.getUint16(12, true),
    zoneH: view.getUint16(14, true),
  };
}

export interface EntityPosition {
  entityId: number;
  x: number;
  y: number;
}

export interface PositionDeltaPayload {
  entities: EntityPosition[];
}

/**
 * 0x11 PositionDelta payload (after header):
 * count:u16, then count × (entity_id:u32, x:u16, y:u16) = 8 bytes each
 */
export function decodePositionDelta(buf: ArrayBuffer): PositionDeltaPayload {
  const view = new DataView(buf);
  const count = view.getUint16(4, true);
  const entities: EntityPosition[] = [];
  let offset = 6;
  for (let i = 0; i < count; i++) {
    entities.push({
      entityId: view.getUint32(offset, true),
      x: view.getUint16(offset + 4, true),
      y: view.getUint16(offset + 6, true),
    });
    offset += 8;
  }
  return { entities };
}

export interface ErrorPayload {
  code: number;
  message: string;
}

/**
 * 0xF0 Error payload (after header):
 * code:u16, message_utf8
 */
export function decodeError(buf: ArrayBuffer): ErrorPayload {
  const view = new DataView(buf);
  const code = view.getUint16(4, true);
  const msgBytes = new Uint8Array(buf, 6);
  return {
    code,
    message: new TextDecoder().decode(msgBytes),
  };
}

/** Read opcode from a raw frame buffer */
export function readOpcode(buf: ArrayBuffer): number {
  return new DataView(buf).getUint8(0);
}
