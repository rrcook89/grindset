export interface Player {
  id: number;
  x: number;
  y: number;
  hp?: number;
  maxHp?: number;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ── Skill ─────────────────────────────────────────────────────────────────────

export type SkillName =
  | "Mining"
  | "Fishing"
  | "Woodcutting"
  | "Melee"
  | "Ranged"
  | "Magic"
  | "Cooking"
  | "Smithing"
  | "Alchemy"
  | "Cartography";

export interface Skill {
  name: SkillName;
  level: number;
  xp: number;
  xpToNextLevel: number;
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export interface InventoryItem {
  slotIndex: number; // 0–27
  itemId: number;
  name: string;
  quantity: number;
  /** Hex colour for placeholder icon */
  color: string;
}

// ── Wallet ────────────────────────────────────────────────────────────────────

export type LedgerDirection = "in" | "out";

export interface LedgerEntry {
  id: string;
  direction: LedgerDirection;
  /** Amount in base units (lamports equivalent) */
  amount: bigint;
  description: string;
  timestamp: number; // unix ms
}

export interface WalletState {
  /** Balance in base units */
  balance: bigint;
  ledger: LedgerEntry[];
}

// ── Quest ─────────────────────────────────────────────────────────────────────

export type QuestStatus = "active" | "complete";

export interface QuestObjective {
  description: string;
  current: number;
  target: number;
}

export interface Quest {
  id: string;
  name: string;
  status: QuestStatus;
  objectives: QuestObjective[];
}

// ── Grand Bazaar ──────────────────────────────────────────────────────────────

export type OrderSide = "buy" | "sell";

export interface GEOrder {
  id: string;
  side: OrderSide;
  itemId: number;
  itemName: string;
  quantity: number;
  filledQty: number;
  priceEach: number; // $GRIND base units
  timestamp: number;
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export type ChatChannel = "global" | "zone" | "guild" | "trade";

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  senderName: string;
  text: string;
  timestamp: number;
}

// ── Combat ────────────────────────────────────────────────────────────────────

export interface CombatTarget {
  entityId: number;
  name: string;
  hp: number;
  maxHp: number;
}

export interface HitSplat {
  id: string;
  entityId: number;
  amount: number;
  /** "damage" | "heal" */
  type: "damage" | "heal";
  timestamp: number;
}

// ── Ability (hotbar) ──────────────────────────────────────────────────────────

export interface Ability {
  slotIndex: number; // 0–4
  id: number;
  name: string;
  /** Cooldown duration in ms */
  cooldownMs: number;
  /** Timestamp when cooldown started (0 = ready) */
  cooldownStart: number;
  color: string;
}
