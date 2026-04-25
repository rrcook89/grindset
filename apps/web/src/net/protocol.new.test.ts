import { describe, it, expect } from "vitest";
import {
  OP,
  encodeAttackIntent,
  encodeAbilityUse,
  encodeSkillStart,
  encodeBankDeposit,
  encodeBankWithdraw,
  encodeChatSend,
  encodeGEOrderCancel,
  decodeCombatUpdate,
  decodeHitSplat,
  decodeSkillTick,
  decodeInventoryDelta,
  decodeChatMessage,
  decodeWalletBalance,
  decodeWalletLedgerEntry,
  readOpcode,
} from "./protocol";

// ── Helper ────────────────────────────────────────────────────────────────────

function hdr(frame: Uint8Array): { op: number; flags: number; len: number } {
  const v = new DataView(frame.buffer);
  return { op: v.getUint8(0), flags: v.getUint8(1), len: v.getUint16(2, true) };
}

// ── encodeAttackIntent (0x30) ─────────────────────────────────────────────────

describe("encodeAttackIntent", () => {
  it("writes correct opcode", () => {
    expect(encodeAttackIntent(1)[0]).toBe(OP.ATTACK_INTENT);
  });

  it("payload length is 4", () => {
    expect(hdr(encodeAttackIntent(1)).len).toBe(4);
  });

  it("round-trips entity_id", () => {
    const frame = encodeAttackIntent(0xdeadbeef);
    expect(new DataView(frame.buffer).getUint32(4, true)).toBe(0xdeadbeef);
  });
});

// ── encodeAbilityUse (0x34) ──────────────────────────────────────────────────

describe("encodeAbilityUse", () => {
  it("writes correct opcode", () => {
    expect(encodeAbilityUse(2)[0]).toBe(OP.ABILITY_USE);
  });

  it("payload length is 1", () => {
    expect(hdr(encodeAbilityUse(0)).len).toBe(1);
  });

  it("round-trips slot index", () => {
    for (let i = 0; i < 5; i++) {
      expect(new DataView(encodeAbilityUse(i).buffer).getUint8(4)).toBe(i);
    }
  });
});

// ── encodeSkillStart (0x50) ──────────────────────────────────────────────────

describe("encodeSkillStart", () => {
  it("writes correct opcode", () => {
    expect(encodeSkillStart(42)[0]).toBe(OP.SKILL_START);
  });

  it("round-trips node_id", () => {
    const frame = encodeSkillStart(12345);
    expect(new DataView(frame.buffer).getUint32(4, true)).toBe(12345);
  });
});

// ── encodeBankDeposit (0x74) ─────────────────────────────────────────────────

describe("encodeBankDeposit", () => {
  it("writes correct opcode", () => {
    expect(encodeBankDeposit(0, 1)[0]).toBe(OP.BANK_DEPOSIT);
  });

  it("payload length is 3", () => {
    expect(hdr(encodeBankDeposit(0, 1)).len).toBe(3);
  });

  it("round-trips slot and quantity", () => {
    const frame = encodeBankDeposit(7, 500);
    const v = new DataView(frame.buffer);
    expect(v.getUint8(4)).toBe(7);
    expect(v.getUint16(5, true)).toBe(500);
  });
});

// ── encodeBankWithdraw (0x75) ─────────────────────────────────────────────────

describe("encodeBankWithdraw", () => {
  it("writes correct opcode", () => {
    expect(encodeBankWithdraw(0, 1)[0]).toBe(OP.BANK_WITHDRAW);
  });

  it("round-trips bank_slot and quantity", () => {
    const frame = encodeBankWithdraw(3, 10);
    const v = new DataView(frame.buffer);
    expect(v.getUint8(4)).toBe(3);
    expect(v.getUint16(5, true)).toBe(10);
  });
});

// ── encodeChatSend (0x90) ─────────────────────────────────────────────────────

describe("encodeChatSend", () => {
  it("writes correct opcode", () => {
    expect(encodeChatSend(0, "hi")[0]).toBe(OP.CHAT_SEND);
  });

  it("encodes channel byte", () => {
    const frame = encodeChatSend(2, "test");
    expect(new DataView(frame.buffer).getUint8(4)).toBe(2);
  });

  it("encodes text length and content", () => {
    const text = "hello world";
    const frame = encodeChatSend(0, text);
    const v = new DataView(frame.buffer);
    const textLen = v.getUint16(5, true);
    expect(textLen).toBe(new TextEncoder().encode(text).byteLength);
    expect(new TextDecoder().decode(new Uint8Array(frame.buffer, 7, textLen))).toBe(text);
  });

  it("handles multibyte UTF-8", () => {
    const text = "héllo";
    const frame = encodeChatSend(1, text);
    const v = new DataView(frame.buffer);
    const textLen = v.getUint16(5, true);
    expect(new TextDecoder().decode(new Uint8Array(frame.buffer, 7, textLen))).toBe(text);
  });
});

// ── encodeGEOrderCancel (0xA4) ───────────────────────────────────────────────

describe("encodeGEOrderCancel", () => {
  it("writes correct opcode", () => {
    expect(encodeGEOrderCancel(1)[0]).toBe(OP.GE_ORDER_CANCEL);
  });

  it("round-trips order_id", () => {
    const frame = encodeGEOrderCancel(999);
    expect(new DataView(frame.buffer).getUint32(4, true)).toBe(999);
  });
});

// ── decodeCombatUpdate (0x31) ─────────────────────────────────────────────────

function makeCombatUpdate(entityId: number, hp: number, maxHp: number, name: string): ArrayBuffer {
  const nameBytes = new TextEncoder().encode(name);
  const buf = new ArrayBuffer(4 + 4 + 2 + 2 + 1 + nameBytes.byteLength);
  const v = new DataView(buf);
  v.setUint8(0, OP.COMBAT_UPDATE);
  v.setUint8(1, 0);
  v.setUint16(2, buf.byteLength - 4, true);
  v.setUint32(4, entityId, true);
  v.setUint16(8, hp, true);
  v.setUint16(10, maxHp, true);
  v.setUint8(12, nameBytes.byteLength);
  new Uint8Array(buf).set(nameBytes, 13);
  return buf;
}

describe("decodeCombatUpdate", () => {
  it("decodes all fields", () => {
    const buf = makeCombatUpdate(7, 45, 100, "Goblin");
    const p = decodeCombatUpdate(buf);
    expect(p.entityId).toBe(7);
    expect(p.hp).toBe(45);
    expect(p.maxHp).toBe(100);
    expect(p.name).toBe("Goblin");
  });

  it("handles empty name", () => {
    const buf = makeCombatUpdate(1, 0, 50, "");
    expect(decodeCombatUpdate(buf).name).toBe("");
  });
});

// ── decodeHitSplat (0x32) ────────────────────────────────────────────────────

function makeHitSplat(entityId: number, amount: number, hitType: number): ArrayBuffer {
  const buf = new ArrayBuffer(4 + 4 + 2 + 1);
  const v = new DataView(buf);
  v.setUint8(0, OP.HIT_SPLAT);
  v.setUint8(1, 0);
  v.setUint16(2, 7, true);
  v.setUint32(4, entityId, true);
  v.setUint16(8, amount, true);
  v.setUint8(10, hitType);
  return buf;
}

describe("decodeHitSplat", () => {
  it("decodes damage splat (type 0)", () => {
    const p = decodeHitSplat(makeHitSplat(5, 30, 0));
    expect(p).toEqual({ entityId: 5, amount: 30, hitType: 0 });
  });

  it("decodes heal splat (type 1)", () => {
    const p = decodeHitSplat(makeHitSplat(2, 15, 1));
    expect(p.hitType).toBe(1);
    expect(p.amount).toBe(15);
  });
});

// ── decodeSkillTick (0x51) ───────────────────────────────────────────────────

function makeSkillTick(skillId: number, xpGained: number, totalXP: number, grindDropped: bigint, itemDefId: string): ArrayBuffer {
  const enc = new TextEncoder();
  const idBytes = enc.encode(itemDefId);
  const payloadLen = 1 + 2 + 4 + 8 + 1 + idBytes.byteLength;
  const buf = new ArrayBuffer(4 + payloadLen);
  const v = new DataView(buf);
  v.setUint8(0, OP.SKILL_TICK);
  v.setUint8(1, 0);
  v.setUint16(2, payloadLen, true);
  v.setUint8(4, skillId);
  v.setUint16(5, xpGained, true);
  v.setUint32(7, totalXP, true);
  v.setUint32(11, Number(grindDropped & 0xffffffffn), true);
  v.setUint32(15, Number(grindDropped >> 32n), true);
  v.setUint8(19, idBytes.byteLength);
  new Uint8Array(buf, 20, idBytes.byteLength).set(idBytes);
  return buf;
}

describe("decodeSkillTick", () => {
  it("decodes SKILL_TICK fields", () => {
    const buf = makeSkillTick(0, 5, 1000, 0n, "ore_copper");
    const p = decodeSkillTick(buf);
    expect(p.skillId).toBe(0);
    expect(p.xpGained).toBe(5);
    expect(p.totalXP).toBe(1000);
    expect(p.grindDropped).toBe(0n);
    expect(p.itemDefId).toBe("ore_copper");
  });

  it("readOpcode returns correct opcode", () => {
    expect(readOpcode(makeSkillTick(0, 1, 0, 0n, ""))).toBe(OP.SKILL_TICK);
  });
});

// ── decodeInventoryDelta (0x71) ───────────────────────────────────────────────
// Server format: count:u8, count × (slot:u8, def_id_len:u8, def_id_utf8, qty:u32)

function makeInventoryDelta(items: Array<{ slot: number; defId: string; qty: number }>): ArrayBuffer {
  const enc = new TextEncoder();
  const encoded = items.map((i) => enc.encode(i.defId));
  const payloadLen = 1 + items.reduce((acc, _, idx) => acc + 1 + 1 + encoded[idx].byteLength + 4, 0);
  const buf = new ArrayBuffer(4 + payloadLen);
  const v = new DataView(buf);
  v.setUint8(0, OP.INVENTORY_DELTA);
  v.setUint8(1, 0);
  v.setUint16(2, payloadLen, true);
  v.setUint8(4, items.length);
  let off = 5;
  items.forEach((item, idx) => {
    v.setUint8(off, item.slot);
    v.setUint8(off + 1, encoded[idx].byteLength);
    new Uint8Array(buf).set(encoded[idx], off + 2);
    off += 2 + encoded[idx].byteLength;
    v.setUint32(off, item.qty, true);
    off += 4;
  });
  return buf;
}

describe("decodeInventoryDelta", () => {
  it("decodes zero items", () => {
    expect(decodeInventoryDelta(makeInventoryDelta([])).items).toHaveLength(0);
  });

  it("decodes a single item", () => {
    const buf = makeInventoryDelta([{ slot: 3, defId: "ore_iron", qty: 10 }]);
    const { items } = decodeInventoryDelta(buf);
    expect(items).toHaveLength(1);
    expect(items[0].slotIndex).toBe(3);
    expect(items[0].itemDefId).toBe("ore_iron");
    expect(items[0].quantity).toBe(10);
  });

  it("decodes multiple items", () => {
    const input = [
      { slot: 0, defId: "ore_copper", qty: 1 },
      { slot: 1, defId: "log_oak", qty: 5 },
    ];
    const { items } = decodeInventoryDelta(makeInventoryDelta(input));
    expect(items).toHaveLength(2);
    expect(items[1].itemDefId).toBe("log_oak");
  });
});

// ── decodeChatMessage (0x91) ──────────────────────────────────────────────────

function makeChatMessage(channel: number, sender: string, text: string): ArrayBuffer {
  const enc = new TextEncoder();
  const sBytes = enc.encode(sender);
  const tBytes = enc.encode(text);
  const payloadLen = 1 + 1 + sBytes.byteLength + 2 + tBytes.byteLength;
  const buf = new ArrayBuffer(4 + payloadLen);
  const v = new DataView(buf);
  v.setUint8(0, OP.CHAT_MESSAGE);
  v.setUint8(1, 0);
  v.setUint16(2, payloadLen, true);
  v.setUint8(4, channel);
  v.setUint8(5, sBytes.byteLength);
  new Uint8Array(buf).set(sBytes, 6);
  const tOff = 6 + sBytes.byteLength;
  v.setUint16(tOff, tBytes.byteLength, true);
  new Uint8Array(buf).set(tBytes, tOff + 2);
  return buf;
}

describe("decodeChatMessage", () => {
  it("decodes channel, sender, text", () => {
    const buf = makeChatMessage(1, "Alice", "hello zone");
    const p = decodeChatMessage(buf);
    expect(p.channel).toBe(1);
    expect(p.senderName).toBe("Alice");
    expect(p.text).toBe("hello zone");
  });

  it("handles global channel (0)", () => {
    expect(decodeChatMessage(makeChatMessage(0, "Bob", "hi")).channel).toBe(0);
  });

  it("handles multibyte sender name", () => {
    const p = decodeChatMessage(makeChatMessage(0, "Müller", "test"));
    expect(p.senderName).toBe("Müller");
  });
});

// ── decodeWalletBalance (0xA0) ────────────────────────────────────────────────

function makeWalletBalance(balance: bigint): ArrayBuffer {
  const buf = new ArrayBuffer(4 + 8);
  const v = new DataView(buf);
  v.setUint8(0, OP.WALLET_BALANCE);
  v.setUint8(1, 0);
  v.setUint16(2, 8, true);
  v.setUint32(4, Number(balance & 0xffffffffn), true);
  v.setUint32(8, Number(balance >> 32n), true);
  return buf;
}

describe("decodeWalletBalance", () => {
  it("decodes zero balance", () => {
    expect(decodeWalletBalance(makeWalletBalance(0n)).balance).toBe(0n);
  });

  it("decodes small balance", () => {
    expect(decodeWalletBalance(makeWalletBalance(1_000_000n)).balance).toBe(1_000_000n);
  });

  it("decodes large u64 balance spanning hi/lo u32", () => {
    const big = 5_000_000_000_000n;
    expect(decodeWalletBalance(makeWalletBalance(big)).balance).toBe(big);
  });
});

// ── decodeWalletLedgerEntry (0xA1) ────────────────────────────────────────────

function makeWalletLedgerEntry(
  entryId: number,
  direction: number,
  amount: bigint,
  timestamp: number,
  description: string,
): ArrayBuffer {
  const enc = new TextEncoder();
  const dBytes = enc.encode(description);
  const payloadLen = 4 + 1 + 4 + 4 + 4 + 1 + dBytes.byteLength;
  const buf = new ArrayBuffer(4 + payloadLen);
  const v = new DataView(buf);
  v.setUint8(0, OP.WALLET_LEDGER_ENTRY);
  v.setUint8(1, 0);
  v.setUint16(2, payloadLen, true);
  v.setUint32(4, entryId, true);
  v.setUint8(8, direction);
  v.setUint32(9, Number(amount & 0xffffffffn), true);
  v.setUint32(13, Number(amount >> 32n), true);
  v.setUint32(17, Math.floor(timestamp / 1000), true);
  v.setUint8(21, dBytes.byteLength);
  new Uint8Array(buf).set(dBytes, 22);
  return buf;
}

describe("decodeWalletLedgerEntry", () => {
  it("decodes all fields", () => {
    const ts = 1_700_000_000_000;
    const buf = makeWalletLedgerEntry(1, 0, 500_000n, ts, "Loot drop");
    const p = decodeWalletLedgerEntry(buf);
    expect(p.entryId).toBe(1);
    expect(p.direction).toBe(0);
    expect(p.amount).toBe(500_000n);
    expect(p.description).toBe("Loot drop");
    // timestamp is unix-seconds converted to ms, so within 1000ms of original
    expect(Math.abs(p.timestamp - ts)).toBeLessThan(1000);
  });

  it("direction 1 = out", () => {
    const buf = makeWalletLedgerEntry(2, 1, 100n, Date.now(), "Fee");
    expect(decodeWalletLedgerEntry(buf).direction).toBe(1);
  });

  it("decodes large amount", () => {
    const big = 10_000_000_000_000n;
    const buf = makeWalletLedgerEntry(3, 0, big, Date.now(), "x");
    expect(decodeWalletLedgerEntry(buf).amount).toBe(big);
  });
});
