import { create } from "zustand";
import type { Player, ConnectionStatus } from "../net/types";
import type {
  Skill,
  InventoryItem,
  WalletState,
  LedgerEntry,
  Quest,
  GEOrder,
  ChatMessage,
  ChatChannel,
  CombatTarget,
  HitSplat,
  Ability,
} from "../net/types";
import { ENTITY_KIND_MOB, ENTITY_KIND_NODE, type EntityPosition } from "../net/protocol";
import type { NodeEntity } from "../game/NodeRenderer";
import type { MobEntity } from "../game/EntityRenderer";

export interface FloatingText {
  id: string;
  /** Tile coords (renderer multiplies by TILE_SIZE) */
  tileX: number;
  tileY: number;
  text: string;
  /** Hex color (e.g. 0x3bd67a) */
  color: number;
  /** Wall-clock ms when this float was born */
  born: number;
}

// ── Dev-only stub nodes (gateway wiring will replace with server data) ────────
// Positions relative to spawn (25,25): rocks nearby, trees NE, fishing spots S.
const DEV_NODES: NodeEntity[] = [
  { id: 2_000_000, kind: "rock", x: 22, y: 22 },
  { id: 2_000_001, kind: "rock", x: 23, y: 23 },
  { id: 2_000_002, kind: "rock", x: 24, y: 24 },
  { id: 2_000_003, kind: "tree", x: 28, y: 20 },
  { id: 2_000_004, kind: "tree", x: 30, y: 22 },
  { id: 2_000_005, kind: "tree", x: 32, y: 24 },
  { id: 2_000_006, kind: "spot", x: 20, y: 30 },
  { id: 2_000_007, kind: "spot", x: 22, y: 32 },
  { id: 2_000_008, kind: "rock", x: 21, y: 25 },
  { id: 2_000_009, kind: "tree", x: 27, y: 27 },
  { id: 2_000_100, kind: "bank", x: 26, y: 25 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const SKILL_NAMES = [
  "Mining",
  "Fishing",
  "Woodcutting",
  "Melee",
  "Ranged",
  "Magic",
  "Cooking",
  "Smithing",
  "Alchemy",
  "Cartography",
] as const;

function xpForLevel(level: number): number {
  // Classic OSRS-style table approximation
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += Math.floor(l + 300 * Math.pow(2, l / 7));
  }
  return Math.floor(total / 4);
}

function defaultSkills(): Skill[] {
  return SKILL_NAMES.map((name) => ({
    name,
    level: 1,
    xp: 0,
    xpToNextLevel: xpForLevel(2),
  }));
}

// ── State interface ───────────────────────────────────────────────────────────

interface GameState {
  // Connection
  connectionStatus: ConnectionStatus;
  localPlayer: Player | null;
  otherPlayers: Map<number, Player>;

  // Skills
  skills: Skill[];
  levelUpFlash: string | null; // skill name flashing

  // Inventory
  inventory: InventoryItem[];
  bankOpen: boolean;
  bankItems: InventoryItem[];

  // Wallet
  wallet: WalletState;

  // Quests
  quests: Quest[];

  // Grand Bazaar
  geOrders: GEOrder[];
  geOpen: boolean;

  // Chat
  chat: ChatMessage[];
  chatChannel: ChatChannel;

  // Combat
  combatTarget: CombatTarget | null;
  hitSplats: HitSplat[];

  // Hotbar abilities
  abilities: Ability[];

  // Skill nodes (populated by gateway when wired; dev stub pre-fills)
  nodes: Map<number, NodeEntity>;

  // Mobs
  mobs: Map<number, MobEntity>;

  // Floating text on canvas (XP gains, $GRIND drops, item drops)
  floats: FloatingText[];

  // Currently-clicked skill node (visual highlight only, not authoritative).
  skillTargetId: number | null;

  // Last swing animation event — purely visual.
  lastSwing: { attackerId: number; targetId: number; born: number } | null;

  // Auth
  jwt: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  setConnectionStatus: (status: ConnectionStatus) => void;
  setLocalPlayer: (player: Player) => void;
  applyPositionDelta: (entities: EntityPosition[]) => void;

  // Nodes
  setNodes: (nodes: NodeEntity[]) => void;
  removeNode: (id: number) => void;

  // Mobs
  setMobs: (mobs: MobEntity[]) => void;
  removeMob: (id: number) => void;

  // Floating text
  pushFloat: (float: Omit<FloatingText, "id" | "born">) => void;
  clearExpiredFloats: () => void;

  setSkillTarget: (id: number | null) => void;
  triggerSwing: (attackerId: number, targetId: number) => void;

  // Skills
  applySkillUpdate: (skill: Skill) => void;
  setLevelUpFlash: (skillName: string | null) => void;

  // Inventory
  setInventory: (items: InventoryItem[]) => void;
  moveInventorySlot: (fromSlot: number, toSlot: number) => void;
  setBankOpen: (open: boolean) => void;
  setBankItems: (items: InventoryItem[]) => void;
  depositItem: (slotIndex: number) => void;
  withdrawItem: (bankSlotIndex: number) => void;

  // Wallet
  setWalletBalance: (balance: bigint) => void;
  addLedgerEntry: (entry: LedgerEntry) => void;

  // Quests
  setQuests: (quests: Quest[]) => void;

  // Grand Bazaar
  setGEOrders: (orders: GEOrder[]) => void;
  setGEOpen: (open: boolean) => void;

  // Chat
  addChatMessage: (msg: ChatMessage) => void;
  setChatChannel: (channel: ChatChannel) => void;

  // Combat
  setCombatTarget: (target: CombatTarget | null) => void;
  applyHitSplat: (splat: HitSplat) => void;
  clearExpiredHitSplats: () => void;

  // Hotbar
  setAbilities: (abilities: Ability[]) => void;
  triggerAbilityCooldown: (slotIndex: number) => void;

  // Auth
  setJwt: (jwt: string | null) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useGameStore = create<GameState>((set, get) => ({
  connectionStatus: "disconnected",
  localPlayer: null,
  otherPlayers: new Map(),
  nodes: new Map(DEV_NODES.map((n) => [n.id, n])),
  mobs: new Map(),
  floats: [],
  skillTargetId: null,
  lastSwing: null,

  skills: defaultSkills(),
  levelUpFlash: null,

  inventory: [],
  bankOpen: false,
  bankItems: [],

  wallet: { balance: 0n, ledger: [] },

  quests: [],

  geOrders: [],
  geOpen: false,

  chat: [],
  chatChannel: "global",

  combatTarget: null,
  hitSplats: [],

  abilities: Array.from({ length: 5 }, (_, i) => ({
    slotIndex: i,
    id: 0,
    name: "",
    cooldownMs: 0,
    cooldownStart: 0,
    color: "#3BD67A",
  })),

  jwt: typeof window !== "undefined" ? (localStorage.getItem("grindset_jwt") ?? null) : null,

  // ── Connection ──────────────────────────────────────────────────────────────

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setLocalPlayer: (player) => set({ localPlayer: player }),

  applyPositionDelta: (entities) => {
    const localId = get().localPlayer?.id;
    const nextPlayers = new Map<number, Player>();
    const nextMobs = new Map(get().mobs);
    const seenMobs = new Set<number>();
    for (const e of entities) {
      if (e.kind === ENTITY_KIND_MOB) {
        seenMobs.add(e.entityId);
        const prev = nextMobs.get(e.entityId);
        nextMobs.set(e.entityId, {
          id: e.entityId,
          kind: prev?.kind ?? "mob",
          x: e.x,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
        });
        continue;
      }
      if (e.kind === ENTITY_KIND_NODE) {
        // Node positions are static; PositionDelta should not normally include them, ignore.
        continue;
      }
      // ENTITY_KIND_PLAYER (or unknown — treat as player)
      if (e.entityId === localId) {
        set((s) => ({
          localPlayer: s.localPlayer
            ? { ...s.localPlayer, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp }
            : s.localPlayer,
        }));
      } else {
        nextPlayers.set(e.entityId, {
          id: e.entityId,
          x: e.x,
          y: e.y,
          hp: e.hp,
          maxHp: e.maxHp,
        });
      }
    }
    // Drop mobs not present in this snapshot (despawn/death).
    for (const id of nextMobs.keys()) {
      if (!seenMobs.has(id)) nextMobs.delete(id);
    }
    set({ otherPlayers: nextPlayers, mobs: nextMobs });
  },

  // ── Nodes ───────────────────────────────────────────────────────────────────

  setNodes: (nodes) => set({ nodes: new Map(nodes.map((n) => [n.id, n])) }),

  removeNode: (id) =>
    set((s) => {
      const next = new Map(s.nodes);
      next.delete(id);
      return { nodes: next };
    }),

  // ── Mobs ────────────────────────────────────────────────────────────────────

  setMobs: (mobs) => set({ mobs: new Map(mobs.map((m) => [m.id, m])) }),

  removeMob: (id) =>
    set((s) => {
      const next = new Map(s.mobs);
      next.delete(id);
      return { mobs: next };
    }),

  // ── Floating text ───────────────────────────────────────────────────────────

  pushFloat: (float) =>
    set((s) => ({
      floats: [
        ...s.floats,
        { ...float, id: `${Date.now()}-${Math.random()}`, born: Date.now() },
      ].slice(-30),
    })),

  clearExpiredFloats: () => {
    const now = Date.now();
    set((s) => ({ floats: s.floats.filter((f) => now - f.born < 1500) }));
  },

  setSkillTarget: (id) => set({ skillTargetId: id }),

  triggerSwing: (attackerId, targetId) =>
    set({ lastSwing: { attackerId, targetId, born: Date.now() } }),

  // ── Skills ──────────────────────────────────────────────────────────────────

  applySkillUpdate: (skill) => {
    set((s) => ({
      skills: s.skills.map((sk) => (sk.name === skill.name ? skill : sk)),
    }));
  },

  setLevelUpFlash: (skillName) => set({ levelUpFlash: skillName }),

  // ── Inventory ───────────────────────────────────────────────────────────────

  setInventory: (items) => set({ inventory: items }),

  moveInventorySlot: (fromSlot, toSlot) => {
    set((s) => {
      const inv = [...s.inventory];
      const fromIdx = inv.findIndex((i) => i.slotIndex === fromSlot);
      const toIdx = inv.findIndex((i) => i.slotIndex === toSlot);
      if (fromIdx === -1) return {};
      if (toIdx === -1) {
        inv[fromIdx] = { ...inv[fromIdx], slotIndex: toSlot };
      } else {
        inv[fromIdx] = { ...inv[fromIdx], slotIndex: toSlot };
        inv[toIdx] = { ...inv[toIdx], slotIndex: fromSlot };
      }
      return { inventory: inv };
    });
  },

  setBankOpen: (open) => set({ bankOpen: open }),

  setBankItems: (items) => set({ bankItems: items }),

  depositItem: (slotIndex) => {
    set((s) => {
      const item = s.inventory.find((i) => i.slotIndex === slotIndex);
      if (!item) return {};
      const freeSlot = s.bankItems.length;
      return {
        inventory: s.inventory.filter((i) => i.slotIndex !== slotIndex),
        bankItems: [...s.bankItems, { ...item, slotIndex: freeSlot }],
      };
    });
  },

  withdrawItem: (bankSlotIndex) => {
    set((s) => {
      const item = s.bankItems.find((i) => i.slotIndex === bankSlotIndex);
      if (!item) return {};
      const usedSlots = new Set(s.inventory.map((i) => i.slotIndex));
      let freeSlot = 0;
      while (usedSlots.has(freeSlot)) freeSlot++;
      if (freeSlot >= 28) return {}; // inventory full
      return {
        bankItems: s.bankItems.filter((i) => i.slotIndex !== bankSlotIndex),
        inventory: [...s.inventory, { ...item, slotIndex: freeSlot }],
      };
    });
  },

  // ── Wallet ──────────────────────────────────────────────────────────────────

  setWalletBalance: (balance) =>
    set((s) => ({ wallet: { ...s.wallet, balance } })),

  addLedgerEntry: (entry) =>
    set((s) => ({
      wallet: {
        ...s.wallet,
        ledger: [entry, ...s.wallet.ledger].slice(0, 50),
      },
    })),

  // ── Quests ──────────────────────────────────────────────────────────────────

  setQuests: (quests) => set({ quests }),

  // ── Grand Bazaar ─────────────────────────────────────────────────────────────

  setGEOrders: (orders) => set({ geOrders: orders }),
  setGEOpen: (open) => set({ geOpen: open }),

  // ── Chat ────────────────────────────────────────────────────────────────────

  addChatMessage: (msg) =>
    set((s) => ({ chat: [...s.chat, msg].slice(-200) })),

  setChatChannel: (channel) => set({ chatChannel: channel }),

  // ── Combat ──────────────────────────────────────────────────────────────────

  setCombatTarget: (target) => set({ combatTarget: target }),

  applyHitSplat: (splat) =>
    set((s) => ({ hitSplats: [...s.hitSplats, splat].slice(-50) })),

  clearExpiredHitSplats: () => {
    const now = Date.now();
    set((s) => ({
      hitSplats: s.hitSplats.filter((sp) => now - sp.timestamp < 2000),
    }));
  },

  // ── Hotbar ──────────────────────────────────────────────────────────────────

  setAbilities: (abilities) => set({ abilities }),

  triggerAbilityCooldown: (slotIndex) =>
    set((s) => ({
      abilities: s.abilities.map((a) =>
        a.slotIndex === slotIndex ? { ...a, cooldownStart: Date.now() } : a,
      ),
    })),

  // ── Auth ────────────────────────────────────────────────────────────────────

  setJwt: (jwt) => {
    if (jwt) localStorage.setItem("grindset_jwt", jwt);
    else localStorage.removeItem("grindset_jwt");
    set({ jwt });
  },
}));
