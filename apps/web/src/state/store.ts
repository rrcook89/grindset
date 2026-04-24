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
import type { EntityPosition } from "../net/protocol";

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

  // Auth
  jwt: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  setConnectionStatus: (status: ConnectionStatus) => void;
  setLocalPlayer: (player: Player) => void;
  applyPositionDelta: (entities: EntityPosition[]) => void;

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
    const next = new Map(get().otherPlayers);
    for (const e of entities) {
      if (e.entityId === localId) {
        set((s) => ({
          localPlayer: s.localPlayer ? { ...s.localPlayer, x: e.x, y: e.y } : s.localPlayer,
        }));
      } else {
        next.set(e.entityId, { id: e.entityId, x: e.x, y: e.y });
      }
    }
    set({ otherPlayers: new Map(next) });
  },

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
