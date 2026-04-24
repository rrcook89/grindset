// Binary wire protocol — all multi-byte integers little-endian.
// Frame: [u8 opcode][u8 flags][u16 length][payload...]

export const OP = {
  // Auth / session  0x00–0x0F
  HELLO: 0x00,
  WELCOME: 0x01,
  AUTH_REQUEST: 0x02,
  AUTH_VERIFY: 0x03,
  AUTH_OK: 0x04,

  // Movement  0x10–0x2F
  MOVE_INTENT: 0x10,
  POSITION_DELTA: 0x11,

  // Combat  0x30–0x4F
  ATTACK_INTENT: 0x30,
  COMBAT_UPDATE: 0x31,
  HIT_SPLAT: 0x32,
  COMBAT_END: 0x33,
  ABILITY_USE: 0x34,

  // Skilling  0x50–0x6F
  SKILL_UPDATE: 0x50,
  SKILL_LEVEL_UP: 0x51,
  SKILL_ACTION: 0x52,

  // Inventory / trade  0x70–0x8F
  INVENTORY_FULL: 0x70,
  INVENTORY_DELTA: 0x71,
  BANK_OPEN: 0x72,
  BANK_CLOSE: 0x73,
  BANK_DEPOSIT: 0x74,
  BANK_WITHDRAW: 0x75,

  // Chat  0x90–0x9F
  CHAT_SEND: 0x90,
  CHAT_MESSAGE: 0x91,

  // Wallet / economy  0xA0–0xAF
  WALLET_BALANCE: 0xa0,
  WALLET_LEDGER_ENTRY: 0xa1,
  GE_ORDER_PLACED: 0xa2,
  GE_ORDER_UPDATE: 0xa3,
  GE_ORDER_CANCEL: 0xa4,

  // System / error  0xF0–0xFF
  ERROR: 0xf0,
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function writeHeader(view: DataView, opcode: number, payloadLen: number): void {
  view.setUint8(0, opcode);
  view.setUint8(1, 0x00); // flags — reserved
  view.setUint16(2, payloadLen, true); // little-endian
}

function alloc(payloadLen: number): { buf: ArrayBuffer; view: DataView; bytes: Uint8Array } {
  const buf = new ArrayBuffer(4 + payloadLen);
  return { buf, view: new DataView(buf), bytes: new Uint8Array(buf) };
}

function encodeString(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function decodeString(buf: ArrayBuffer, byteOffset: number, byteLength?: number): string {
  const slice =
    byteLength !== undefined
      ? new Uint8Array(buf, byteOffset, byteLength)
      : new Uint8Array(buf, byteOffset);
  return new TextDecoder().decode(slice);
}

// ── Encoders ─────────────────────────────────────────────────────────────────

/** 0x00 Hello — sent by client after WS open (dev mode skips auth) */
export function encodeHello(devUser: string): Uint8Array {
  const nameBytes = encodeString(devUser);
  const { buf, view, bytes } = alloc(nameBytes.byteLength);
  writeHeader(view, OP.HELLO, nameBytes.byteLength);
  bytes.set(nameBytes, 4);
  return bytes;
}

/** 0x10 MoveIntent — client tile click */
export function encodeMoveIntent(targetX: number, targetY: number): Uint8Array {
  const { buf, view } = alloc(4); // x:u16 + y:u16
  writeHeader(view, OP.MOVE_INTENT, 4);
  view.setUint16(4, targetX, true);
  view.setUint16(6, targetY, true);
  return new Uint8Array(buf);
}

/** 0x30 AttackIntent — target an entity */
export function encodeAttackIntent(entityId: number): Uint8Array {
  const { buf, view } = alloc(4); // entity_id:u32
  writeHeader(view, OP.ATTACK_INTENT, 4);
  view.setUint32(4, entityId, true);
  return new Uint8Array(buf);
}

/** 0x34 AbilityUse — use ability in hotbar slot */
export function encodeAbilityUse(slotIndex: number): Uint8Array {
  const { buf, view } = alloc(1); // slot:u8
  writeHeader(view, OP.ABILITY_USE, 1);
  view.setUint8(4, slotIndex);
  return new Uint8Array(buf);
}

/** 0x52 SkillAction — start a skilling action on a node */
export function encodeSkillAction(nodeId: number): Uint8Array {
  const { buf, view } = alloc(4); // node_id:u32
  writeHeader(view, OP.SKILL_ACTION, 4);
  view.setUint32(4, nodeId, true);
  return new Uint8Array(buf);
}

/** 0x74 BankDeposit — move item from inventory slot to bank */
export function encodeBankDeposit(slotIndex: number, quantity: number): Uint8Array {
  const { buf, view } = alloc(3); // slot:u8, qty:u16
  writeHeader(view, OP.BANK_DEPOSIT, 3);
  view.setUint8(4, slotIndex);
  view.setUint16(5, quantity, true);
  return new Uint8Array(buf);
}

/** 0x75 BankWithdraw — move item from bank to inventory */
export function encodeBankWithdraw(bankSlot: number, quantity: number): Uint8Array {
  const { buf, view } = alloc(3); // slot:u8, qty:u16
  writeHeader(view, OP.BANK_WITHDRAW, 3);
  view.setUint8(4, bankSlot);
  view.setUint16(5, quantity, true);
  return new Uint8Array(buf);
}

/** 0x90 ChatSend — send a chat message */
export function encodeChatSend(channel: number, text: string): Uint8Array {
  const textBytes = encodeString(text);
  // channel:u8, text_len:u16, text_utf8
  const payloadLen = 1 + 2 + textBytes.byteLength;
  const { buf, view, bytes } = alloc(payloadLen);
  writeHeader(view, OP.CHAT_SEND, payloadLen);
  view.setUint8(4, channel);
  view.setUint16(5, textBytes.byteLength, true);
  bytes.set(textBytes, 7);
  return bytes;
}

/** 0xA4 GEOrderCancel — cancel an active order */
export function encodeGEOrderCancel(orderId: number): Uint8Array {
  const { buf, view } = alloc(4); // order_id:u32
  writeHeader(view, OP.GE_ORDER_CANCEL, 4);
  view.setUint32(4, orderId, true);
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
  return {
    code,
    message: decodeString(buf, 6),
  };
}

export interface CombatUpdatePayload {
  entityId: number;
  hp: number;
  maxHp: number;
  nameLen: number;
  name: string;
}

/**
 * 0x31 CombatUpdate payload (after header):
 * entity_id:u32, hp:u16, max_hp:u16, name_len:u8, name_utf8
 */
export function decodeCombatUpdate(buf: ArrayBuffer): CombatUpdatePayload {
  const view = new DataView(buf);
  const entityId = view.getUint32(4, true);
  const hp = view.getUint16(8, true);
  const maxHp = view.getUint16(10, true);
  const nameLen = view.getUint8(12);
  const name = decodeString(buf, 13, nameLen);
  return { entityId, hp, maxHp, nameLen, name };
}

export interface HitSplatPayload {
  entityId: number;
  amount: number;
  /** 0 = damage, 1 = heal */
  hitType: number;
}

/**
 * 0x32 HitSplat payload (after header):
 * entity_id:u32, amount:u16, hit_type:u8
 */
export function decodeHitSplat(buf: ArrayBuffer): HitSplatPayload {
  const view = new DataView(buf);
  return {
    entityId: view.getUint32(4, true),
    amount: view.getUint16(8, true),
    hitType: view.getUint8(10),
  };
}

export interface SkillUpdatePayload {
  skillId: number; // index into SKILL_NAMES
  level: number;
  xp: number;
  xpToNextLevel: number;
}

/**
 * 0x50 SkillUpdate / 0x51 SkillLevelUp payload (after header):
 * skill_id:u8, level:u8, xp:u32, xp_to_next:u32
 */
export function decodeSkillUpdate(buf: ArrayBuffer): SkillUpdatePayload {
  const view = new DataView(buf);
  return {
    skillId: view.getUint8(4),
    level: view.getUint8(5),
    xp: view.getUint32(6, true),
    xpToNextLevel: view.getUint32(10, true),
  };
}

export interface InventoryDeltaItem {
  slotIndex: number;
  itemId: number;
  quantity: number;
  nameLen: number;
  name: string;
  color: number; // packed RGB u24
}

export interface InventoryDeltaPayload {
  items: InventoryDeltaItem[];
}

/**
 * 0x71 InventoryDelta payload (after header):
 * count:u8, then count × (slot:u8, item_id:u16, qty:u16, name_len:u8, name_utf8, color:u24)
 */
export function decodeInventoryDelta(buf: ArrayBuffer): InventoryDeltaPayload {
  const view = new DataView(buf);
  const count = view.getUint8(4);
  const items: InventoryDeltaItem[] = [];
  let offset = 5;
  for (let i = 0; i < count; i++) {
    const slotIndex = view.getUint8(offset);
    const itemId = view.getUint16(offset + 1, true);
    const quantity = view.getUint16(offset + 3, true);
    const nameLen = view.getUint8(offset + 5);
    const name = decodeString(buf, offset + 6, nameLen);
    offset += 6 + nameLen;
    const color = (view.getUint8(offset) << 16) | (view.getUint8(offset + 1) << 8) | view.getUint8(offset + 2);
    offset += 3;
    items.push({ slotIndex, itemId, quantity, nameLen, name, color });
  }
  return { items };
}

export interface ChatMessagePayload {
  channel: number; // 0=global,1=zone,2=guild,3=trade
  senderNameLen: number;
  senderName: string;
  textLen: number;
  text: string;
}

/**
 * 0x91 ChatMessage payload (after header):
 * channel:u8, sender_len:u8, sender_utf8, text_len:u16, text_utf8
 */
export function decodeChatMessage(buf: ArrayBuffer): ChatMessagePayload {
  const view = new DataView(buf);
  const channel = view.getUint8(4);
  const senderNameLen = view.getUint8(5);
  const senderName = decodeString(buf, 6, senderNameLen);
  const textOffset = 6 + senderNameLen;
  const textLen = view.getUint16(textOffset, true);
  const text = decodeString(buf, textOffset + 2, textLen);
  return { channel, senderNameLen, senderName, textLen, text };
}

export interface WalletBalancePayload {
  /** Balance in base units (u64, stored as two u32 hi/lo) */
  balance: bigint;
}

/**
 * 0xA0 WalletBalance payload (after header):
 * balance_lo:u32, balance_hi:u32  (little-endian u64)
 */
export function decodeWalletBalance(buf: ArrayBuffer): WalletBalancePayload {
  const view = new DataView(buf);
  const lo = BigInt(view.getUint32(4, true));
  const hi = BigInt(view.getUint32(8, true));
  return { balance: (hi << 32n) | lo };
}

export interface WalletLedgerEntryPayload {
  entryId: number;
  direction: number; // 0=in, 1=out
  amount: bigint;
  descLen: number;
  description: string;
  timestamp: number;
}

/**
 * 0xA1 WalletLedgerEntry payload (after header):
 * entry_id:u32, direction:u8, amount_lo:u32, amount_hi:u32,
 * timestamp:u32, desc_len:u8, desc_utf8
 */
export function decodeWalletLedgerEntry(buf: ArrayBuffer): WalletLedgerEntryPayload {
  const view = new DataView(buf);
  const entryId = view.getUint32(4, true);
  const direction = view.getUint8(8);
  const amountLo = BigInt(view.getUint32(9, true));
  const amountHi = BigInt(view.getUint32(13, true));
  const amount = (amountHi << 32n) | amountLo;
  const timestamp = view.getUint32(17, true);
  const descLen = view.getUint8(21);
  const description = decodeString(buf, 22, descLen);
  return { entryId, direction, amount, descLen, description, timestamp: timestamp * 1000 };
}

/** Read opcode from a raw frame buffer */
export function readOpcode(buf: ArrayBuffer): number {
  return new DataView(buf).getUint8(0);
}
