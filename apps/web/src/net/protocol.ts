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

  // Combat  0x30–0x4F  — aligned to server opcodes.go
  COMBAT_TARGET: 0x30,  // C→S: target this entity (0 to clear)
  COMBAT_HIT: 0x31,     // S→C: a swing resolved (damage=0 means miss)
  COMBAT_DEATH: 0x32,   // S→C: entity died
  ABILITY_USE: 0x34,    // C→S: trigger hotbar ability

  // Skilling  0x50–0x6F  — aligned to server opcodes.go
  SKILL_START: 0x50,    // C→S: start skilling on node_id
  SKILL_TICK: 0x51,     // S→C: action completed, here's your XP + item
  SKILL_STOP: 0x52,     // C→S: stop skilling
  SKILL_LEVEL_UP: 0x53, // S→C: ding

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
  const { view, bytes } = alloc(nameBytes.byteLength);
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
export function encodeCombatTarget(entityId: number): Uint8Array {
  const { buf, view } = alloc(4); // entity_id:u32 (0 = clear target)
  writeHeader(view, OP.COMBAT_TARGET, 4);
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

/** 0x50 SkillStart — start a skilling action on a node */
export function encodeSkillStart(nodeId: number): Uint8Array {
  const { buf, view } = alloc(4); // node_id:u32
  writeHeader(view, OP.SKILL_START, 4);
  view.setUint32(4, nodeId, true);
  return new Uint8Array(buf);
}

/** 0x52 SkillStop — stop the active skilling action (no payload) */
export function encodeSkillStop(): Uint8Array {
  const { buf, view } = alloc(0);
  writeHeader(view, OP.SKILL_STOP, 0);
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
  const { view, bytes } = alloc(payloadLen);
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

// Entity kinds (matches server protocol.EntityKind*)
export const ENTITY_KIND_PLAYER = 0;
export const ENTITY_KIND_MOB = 1;
export const ENTITY_KIND_NODE = 2;

export interface EntityPosition {
  entityId: number;
  x: number;
  y: number;
  kind: number;
  hp: number;
  maxHp: number;
}

export interface PositionDeltaPayload {
  entities: EntityPosition[];
}

/**
 * 0x11 PositionDelta payload (after header):
 * count:u16, then count × (entity_id:u32, x:u16, y:u16, kind:u8, hp:u16, max_hp:u16) = 13 bytes each
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
      kind: view.getUint8(offset + 8),
      hp: view.getUint16(offset + 9, true),
      maxHp: view.getUint16(offset + 11, true),
    });
    offset += 13;
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

export interface CombatHitPayload {
  attackerId: number;
  targetId: number;
  damage: number; // 0 = miss
  maxHit: number;
  targetHp: number;
  targetMaxHp: number;
}

/**
 * 0x31 CombatHit payload (after header):
 * attacker_id:u32, target_id:u32, damage:u16, max_hit:u16,
 * target_hp:u16, target_max_hp:u16
 * (matches server EncodeCombatHit)
 */
export function decodeCombatHit(buf: ArrayBuffer): CombatHitPayload {
  const view = new DataView(buf);
  return {
    attackerId: view.getUint32(4, true),
    targetId: view.getUint32(8, true),
    damage: view.getUint16(12, true),
    maxHit: view.getUint16(14, true),
    targetHp: view.getUint16(16, true),
    targetMaxHp: view.getUint16(18, true),
  };
}

export interface CombatDeathPayload {
  entityId: number;
  killerId: number;
}

/**
 * 0x32 CombatDeath payload (after header):
 * entity_id:u32, killer_id:u32
 */
export function decodeCombatDeath(buf: ArrayBuffer): CombatDeathPayload {
  const view = new DataView(buf);
  return {
    entityId: view.getUint32(4, true),
    killerId: view.getUint32(8, true),
  };
}

export interface SkillTickPayload {
  skillId: number; // index into SKILL_NAMES
  xpGained: number;
  totalXP: number;
  grindDropped: bigint; // base units (9 decimals)
  itemDefId: string; // empty if no item awarded
}

/**
 * 0x51 SkillTick payload (after header):
 * skill:u8, xp_gained:u16, total_xp:u32, grind_dropped:u64, item_def_id_len:u8, item_def_id_utf8
 */
export function decodeSkillTick(buf: ArrayBuffer): SkillTickPayload {
  const view = new DataView(buf);
  const skillId = view.getUint8(4);
  const xpGained = view.getUint16(5, true);
  const totalXP = view.getUint32(7, true);
  const lo = view.getUint32(11, true);
  const hi = view.getUint32(15, true);
  const grindDropped = (BigInt(hi) << 32n) | BigInt(lo);
  const idLen = view.getUint8(19);
  const itemDefId = decodeString(buf, 20, idLen);
  return { skillId, xpGained, totalXP, grindDropped, itemDefId };
}

export interface SkillLevelUpPayload {
  skillId: number;
  newLevel: number;
}

/** 0x53 SkillLevelUp payload (after header): skill:u8, new_level:u8 */
export function decodeSkillLevelUp(buf: ArrayBuffer): SkillLevelUpPayload {
  const view = new DataView(buf);
  return {
    skillId: view.getUint8(4),
    newLevel: view.getUint8(5),
  };
}

export interface InventoryDeltaItem {
  slotIndex: number;
  itemDefId: string; // empty = empty slot
  quantity: number;
}

export interface InventoryDeltaPayload {
  items: InventoryDeltaItem[];
}

/**
 * 0x70 InventoryFull / 0x71 InventoryDelta payload (after header):
 * count:u8, count × (slot:u8, def_id_len:u8, def_id_utf8, qty:u32)
 * (matches server EncodeInventoryFull / EncodeInventoryDelta)
 */
export function decodeInventoryDelta(buf: ArrayBuffer): InventoryDeltaPayload {
  const view = new DataView(buf);
  const count = view.getUint8(4);
  const items: InventoryDeltaItem[] = [];
  let offset = 5;
  for (let i = 0; i < count; i++) {
    const slotIndex = view.getUint8(offset);
    offset += 1;
    const defLen = view.getUint8(offset);
    offset += 1;
    const itemDefId = decodeString(buf, offset, defLen);
    offset += defLen;
    const quantity = view.getUint32(offset, true);
    offset += 4;
    items.push({ slotIndex, itemDefId, quantity });
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
