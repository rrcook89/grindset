import { describe, it, expect } from "vitest";
import {
  OP,
  encodeHello,
  encodeMoveIntent,
  decodeWelcome,
  decodePositionDelta,
  decodeError,
  readOpcode,
} from "./protocol";

// ── Helpers ───────────────────────────────────────────────────────────────────

function header(buf: Uint8Array): { opcode: number; flags: number; len: number } {
  const view = new DataView(buf.buffer);
  return {
    opcode: view.getUint8(0),
    flags: view.getUint8(1),
    len: view.getUint16(2, true),
  };
}

// ── Hello (0x00) ──────────────────────────────────────────────────────────────

describe("encodeHello", () => {
  it("writes correct opcode", () => {
    const frame = encodeHello("alice");
    expect(frame[0]).toBe(OP.HELLO);
  });

  it("flags byte is 0", () => {
    expect(encodeHello("alice")[1]).toBe(0);
  });

  it("length field matches UTF-8 byte count", () => {
    const name = "alice";
    const frame = encodeHello(name);
    const { len } = header(frame);
    expect(len).toBe(new TextEncoder().encode(name).byteLength);
  });

  it("payload contains the dev_user string", () => {
    const frame = encodeHello("bob");
    const payload = frame.slice(4);
    expect(new TextDecoder().decode(payload)).toBe("bob");
  });

  it("handles multibyte UTF-8 names", () => {
    const name = "grüße"; // 7 bytes in UTF-8
    const frame = encodeHello(name);
    expect(new TextDecoder().decode(frame.slice(4))).toBe(name);
  });
});

// ── MoveIntent (0x10) ─────────────────────────────────────────────────────────

describe("encodeMoveIntent", () => {
  it("writes correct opcode", () => {
    expect(encodeMoveIntent(5, 10)[0]).toBe(OP.MOVE_INTENT);
  });

  it("payload length is 4 (two u16)", () => {
    const { len } = header(encodeMoveIntent(5, 10));
    expect(len).toBe(4);
  });

  it("round-trips x and y little-endian", () => {
    const frame = encodeMoveIntent(300, 499);
    const view = new DataView(frame.buffer);
    expect(view.getUint16(4, true)).toBe(300);
    expect(view.getUint16(6, true)).toBe(499);
  });

  it("handles zero coordinates", () => {
    const frame = encodeMoveIntent(0, 0);
    const view = new DataView(frame.buffer);
    expect(view.getUint16(4, true)).toBe(0);
    expect(view.getUint16(6, true)).toBe(0);
  });

  it("handles max u16 coordinates", () => {
    const frame = encodeMoveIntent(65535, 65535);
    const view = new DataView(frame.buffer);
    expect(view.getUint16(4, true)).toBe(65535);
    expect(view.getUint16(6, true)).toBe(65535);
  });
});

// ── Welcome (0x01) ────────────────────────────────────────────────────────────

function makeWelcomeBuffer(
  playerId: number,
  spawnX: number,
  spawnY: number,
  zoneW: number,
  zoneH: number,
): ArrayBuffer {
  // header(4) + u32(4) + u16×4(8) = 16 bytes
  const buf = new ArrayBuffer(16);
  const view = new DataView(buf);
  view.setUint8(0, OP.WELCOME);
  view.setUint8(1, 0);
  view.setUint16(2, 12, true); // payload length
  view.setUint32(4, playerId, true);
  view.setUint16(8, spawnX, true);
  view.setUint16(10, spawnY, true);
  view.setUint16(12, zoneW, true);
  view.setUint16(14, zoneH, true);
  return buf;
}

describe("decodeWelcome", () => {
  it("decodes all fields correctly", () => {
    const buf = makeWelcomeBuffer(42, 10, 20, 50, 50);
    const result = decodeWelcome(buf);
    expect(result).toEqual({ playerId: 42, spawnX: 10, spawnY: 20, zoneW: 50, zoneH: 50 });
  });

  it("handles large player id (u32)", () => {
    const buf = makeWelcomeBuffer(0xdeadbeef, 1, 2, 128, 128);
    expect(decodeWelcome(buf).playerId).toBe(0xdeadbeef);
  });

  it("readOpcode returns WELCOME for this buffer", () => {
    const buf = makeWelcomeBuffer(1, 0, 0, 50, 50);
    expect(readOpcode(buf)).toBe(OP.WELCOME);
  });
});

// ── PositionDelta (0x11) ──────────────────────────────────────────────────────

function makePositionDeltaBuffer(
  entities: Array<{ entityId: number; x: number; y: number }>,
): ArrayBuffer {
  // header(4) + count:u16(2) + entities×8
  const payloadLen = 2 + entities.length * 8;
  const buf = new ArrayBuffer(4 + payloadLen);
  const view = new DataView(buf);
  view.setUint8(0, OP.POSITION_DELTA);
  view.setUint8(1, 0);
  view.setUint16(2, payloadLen, true);
  view.setUint16(4, entities.length, true);
  let offset = 6;
  for (const e of entities) {
    view.setUint32(offset, e.entityId, true);
    view.setUint16(offset + 4, e.x, true);
    view.setUint16(offset + 6, e.y, true);
    offset += 8;
  }
  return buf;
}

describe("decodePositionDelta", () => {
  it("decodes zero entities", () => {
    const buf = makePositionDeltaBuffer([]);
    expect(decodePositionDelta(buf).entities).toHaveLength(0);
  });

  it("decodes a single entity", () => {
    const buf = makePositionDeltaBuffer([{ entityId: 7, x: 15, y: 30 }]);
    const { entities } = decodePositionDelta(buf);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toEqual({ entityId: 7, x: 15, y: 30 });
  });

  it("decodes multiple entities in order", () => {
    const input = [
      { entityId: 1, x: 0, y: 0 },
      { entityId: 2, x: 10, y: 20 },
      { entityId: 99, x: 49, y: 49 },
    ];
    const buf = makePositionDeltaBuffer(input);
    expect(decodePositionDelta(buf).entities).toEqual(input);
  });

  it("handles u32 entity IDs", () => {
    const buf = makePositionDeltaBuffer([{ entityId: 0xffffffff, x: 1, y: 1 }]);
    expect(decodePositionDelta(buf).entities[0].entityId).toBe(0xffffffff);
  });
});

// ── Error (0xF0) ──────────────────────────────────────────────────────────────

function makeErrorBuffer(code: number, message: string): ArrayBuffer {
  const msgBytes = new TextEncoder().encode(message);
  const buf = new ArrayBuffer(4 + 2 + msgBytes.byteLength);
  const view = new DataView(buf);
  view.setUint8(0, OP.ERROR);
  view.setUint8(1, 0);
  view.setUint16(2, 2 + msgBytes.byteLength, true);
  view.setUint16(4, code, true);
  new Uint8Array(buf).set(msgBytes, 6);
  return buf;
}

describe("decodeError", () => {
  it("decodes code and message", () => {
    const buf = makeErrorBuffer(404, "zone not found");
    expect(decodeError(buf)).toEqual({ code: 404, message: "zone not found" });
  });

  it("handles empty message", () => {
    const buf = makeErrorBuffer(0, "");
    expect(decodeError(buf)).toEqual({ code: 0, message: "" });
  });

  it("handles multibyte UTF-8 in message", () => {
    const msg = "erreur: données invalides";
    const buf = makeErrorBuffer(500, msg);
    expect(decodeError(buf).message).toBe(msg);
  });
});

// ── readOpcode ────────────────────────────────────────────────────────────────

describe("readOpcode", () => {
  it.each([
    [OP.HELLO, "HELLO"],
    [OP.WELCOME, "WELCOME"],
    [OP.MOVE_INTENT, "MOVE_INTENT"],
    [OP.POSITION_DELTA, "POSITION_DELTA"],
    [OP.ERROR, "ERROR"],
  ])("returns %i for %s frame", (opcode) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint8(0, opcode);
    expect(readOpcode(buf)).toBe(opcode);
  });
});
