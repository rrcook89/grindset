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
// Order MUST match apps/server/internal/zone/nodes.go static seed so the
// nodeIDBase + index alignment is stable. Bank tile is appended last with a
// far-away id so it doesn't collide with future world nodes.
const DEV_NODES: NodeEntity[] = [
  // Starter cluster (level 1)
  { id: 2_000_000, kind: "rock", defId: "rock_copper",  x: 22, y: 22 },
  { id: 2_000_001, kind: "rock", defId: "rock_copper",  x: 23, y: 23 },
  { id: 2_000_002, kind: "rock", defId: "rock_copper",  x: 21, y: 25 },
  { id: 2_000_003, kind: "tree", defId: "tree_normal",  x: 28, y: 20 },
  { id: 2_000_004, kind: "tree", defId: "tree_normal",  x: 30, y: 22 },
  { id: 2_000_005, kind: "tree", defId: "tree_normal",  x: 27, y: 27 },
  { id: 2_000_006, kind: "spot", defId: "spot_shrimp",  x: 20, y: 30 },
  { id: 2_000_007, kind: "spot", defId: "spot_shrimp",  x: 22, y: 32 },
  // Mid tier (level 5)
  { id: 2_000_008, kind: "rock", defId: "rock_iron",    x: 24, y: 24 },
  { id: 2_000_009, kind: "rock", defId: "rock_iron",    x: 18, y: 14 },
  { id: 2_000_010, kind: "tree", defId: "tree_oak",     x: 32, y: 24 },
  { id: 2_000_011, kind: "tree", defId: "tree_oak",     x: 35, y: 20 },
  { id: 2_000_012, kind: "spot", defId: "spot_trout",   x: 16, y: 36 },
  // Higher tier (level 10)
  { id: 2_000_013, kind: "rock", defId: "rock_coal",    x: 10, y: 12 },
  { id: 2_000_014, kind: "rock", defId: "rock_coal",    x: 12, y: 10 },
  { id: 2_000_015, kind: "tree", defId: "tree_willow",  x: 38, y: 14 },
  { id: 2_000_016, kind: "spot", defId: "spot_lobster", x: 10, y: 42 },
  // End-game (level 15)
  { id: 2_000_017, kind: "rock", defId: "rock_mithril", x: 6,  y: 6 },
  { id: 2_000_018, kind: "tree", defId: "tree_yew",     x: 44, y: 10 },
  { id: 2_000_019, kind: "spot", defId: "spot_swordfish", x: 8, y: 46 },
  // Smithing furnaces — adjacent to the bank for OSRS-style smelt loop.
  { id: 2_000_020, kind: "furnace", defId: "furnace_bronze", x: 28, y: 25 },
  { id: 2_000_021, kind: "furnace", defId: "furnace_iron",   x: 28, y: 26 },
  // Cooking firepits — south of the bank cluster.
  { id: 2_000_022, kind: "firepit", defId: "firepit_shrimp",  x: 24, y: 30 },
  { id: 2_000_023, kind: "firepit", defId: "firepit_trout",   x: 25, y: 30 },
  { id: 2_000_024, kind: "firepit", defId: "firepit_lobster", x: 26, y: 30 },
  // Bank
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

// ── Persisted slice (localStorage-backed) ─────────────────────────────────────
//
// Quest progress + cumulative session metrics survive reloads. Inventory and
// wallet are NOT persisted because the server is authoritative and will
// re-broadcast them on connect.

const PERSIST_KEY = "grindset_persist_v1";

interface PersistedSlice {
  quests: Quest[];
  totalKills: number;
  totalGrindEarned: string; // BigInt serialised as decimal string
}

function loadPersisted(): PersistedSlice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedSlice>;
    if (!data.quests || !Array.isArray(data.quests)) return null;
    return {
      quests: data.quests as Quest[],
      totalKills: data.totalKills ?? 0,
      totalGrindEarned: data.totalGrindEarned ?? "0",
    };
  } catch {
    return null;
  }
}

function savePersisted(s: { quests: Quest[]; totalKills: number; totalGrindEarned: bigint }): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        quests: s.quests,
        totalKills: s.totalKills,
        totalGrindEarned: s.totalGrindEarned.toString(),
      }),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function starterQuests(): Quest[] {
  return [
    {
      id: "welcome_to_mireholm",
      name: "Welcome to Mireholm",
      status: "active",
      objectives: [
        { description: "Mine 3 ores", current: 0, target: 3 },
        { description: "Kill 1 mob", current: 0, target: 1 },
        { description: "Visit the bank", current: 0, target: 1 },
      ],
    },
    {
      id: "swing_school",
      name: "Swing School",
      status: "active",
      objectives: [
        { description: "Land 5 critical hits", current: 0, target: 5 },
        { description: "Reach Melee level 3", current: 0, target: 3 },
      ],
    },
  ];
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
  lastSwing: { attackerId: number; targetId: number; damage: number; born: number } | null;

  // Last death the local player suffered, used by DeathOverlay.
  lastDeath: { killerName: string; at: number } | null;

  // Currently-equipped weapon defID (client-side prediction; server is
  // authoritative for damage rolls). null = unarmed.
  equippedWeapon: string | null;

  // Session metrics (client-only stats, reset per-tab).
  sessionStart: number;
  totalKills: number;
  totalGrindEarned: bigint;

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
  triggerSwing: (attackerId: number, targetId: number, damage: number) => void;
  recordKill: () => void;
  setLastDeath: (killerName: string) => void;
  setEquippedWeapon: (defID: string | null) => void;

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
  /**
   * Increment a quest objective by `amount`. If the quest's last incomplete
   * objective fills, the quest is marked complete.
   */
  incQuestObjective: (questId: string, objectiveIdx: number, amount: number) => void;

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
  lastDeath: null,
  sessionStart: Date.now(),
  totalKills: loadPersisted()?.totalKills ?? 0,
  totalGrindEarned: BigInt(loadPersisted()?.totalGrindEarned ?? "0"),
  equippedWeapon: null,

  skills: defaultSkills(),
  levelUpFlash: null,

  inventory: [],
  bankOpen: false,
  bankItems: [],

  wallet: { balance: 0n, ledger: [] },

  quests: (loadPersisted()?.quests) ?? starterQuests(),

  geOrders: [],
  geOpen: false,

  chat: [],
  chatChannel: "global",

  combatTarget: null,
  hitSplats: [],

  abilities: [
    {
      slotIndex: 0,
      id: 1, // heavy_strike
      name: "Heavy Strike",
      cooldownMs: 6_000, // matches server abilityHeavyStrikeCooldown × 400ms
      cooldownStart: 0,
      color: "#E04545", // loss-red
    },
    {
      slotIndex: 1,
      id: 2, // bandage
      name: "Bandage",
      cooldownMs: 12_000,
      cooldownStart: 0,
      color: "#3BD67A", // gain-green
    },
    ...Array.from({ length: 3 }, (_, i) => ({
      slotIndex: 2 + i,
      id: 0,
      name: "",
      cooldownMs: 0,
      cooldownStart: 0,
      color: "#3BD67A",
    })),
  ],

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

  triggerSwing: (attackerId, targetId, damage) =>
    set({ lastSwing: { attackerId, targetId, damage, born: Date.now() } }),

  recordKill: () => set((s) => ({ totalKills: s.totalKills + 1 })),

  setLastDeath: (killerName) =>
    set({ lastDeath: { killerName, at: Date.now() } }),

  setEquippedWeapon: (defID) => set({ equippedWeapon: defID }),

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
      // Track inbound flow only (skip withdrawals/spends).
      totalGrindEarned:
        entry.direction === "in"
          ? s.totalGrindEarned + entry.amount
          : s.totalGrindEarned,
    })),

  // ── Quests ──────────────────────────────────────────────────────────────────

  setQuests: (quests) => set({ quests }),

  incQuestObjective: (questId, objectiveIdx, amount) =>
    set((s) => {
      let completedNow: { id: string; name: string } | null = null;
      const next = s.quests.map((q) => {
        if (q.id !== questId || q.status === "complete") return q;
        const objs = q.objectives.map((o, i) => {
          if (i !== objectiveIdx) return o;
          if (o.current >= o.target) return o;
          return { ...o, current: Math.min(o.target, o.current + amount) };
        });
        const allDone = objs.every((o) => o.current >= o.target);
        if (allDone) completedNow = { id: q.id, name: q.name };
        return { ...q, objectives: objs, status: allDone ? ("complete" as const) : q.status };
      });
      // Grant a one-time \$GRIND reward when a quest first completes. Client-
      // predicted; reconciles on next server-authoritative wallet broadcast.
      // Reward scales with quest objective count (rough proxy for difficulty).
      if (completedNow !== null) {
        const completed: { id: string; name: string } = completedNow;
        const finishedQuest = s.quests.find((q) => q.id === completed.id);
        const objCount = finishedQuest?.objectives.length ?? 1;
        const rewardWhole = objCount * 25; // 75 \$GRIND for the welcome quest, etc.
        const rewardBase = BigInt(rewardWhole) * 1_000_000_000n;
        const rewardLedger: LedgerEntry = {
          id: `quest-${completed.id}-${Date.now()}`,
          direction: "in",
          amount: rewardBase,
          description: "quest_reward:" + completed.id,
          timestamp: Date.now(),
        };
        const sysMsg: ChatMessage = {
          id: `quest-complete-${Date.now()}-${Math.random()}`,
          channel: "global",
          senderName: "system",
          text: `★ Quest complete: ${completed.name} (+${rewardWhole} \$GRIND)`,
          timestamp: Date.now(),
        };
        return {
          quests: next,
          wallet: {
            ...s.wallet,
            balance: s.wallet.balance + rewardBase,
            ledger: [rewardLedger, ...s.wallet.ledger].slice(0, 50),
          },
          totalGrindEarned: s.totalGrindEarned + rewardBase,
          chat: [...s.chat, sysMsg].slice(-200),
        };
      }
      return { quests: next };
    }),

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

// Persist quests / totalKills / totalGrindEarned to localStorage on every
// store change. Throttled to ~1 write per 500ms so a rapid stream of XP
// ticks doesn't hammer disk.
if (typeof window !== "undefined") {
  let lastQuests: unknown = null;
  let lastKills = -1;
  let lastEarned = -1n;
  let pending: ReturnType<typeof setTimeout> | null = null;
  useGameStore.subscribe((s) => {
    if (s.quests === lastQuests && s.totalKills === lastKills && s.totalGrindEarned === lastEarned) {
      return;
    }
    lastQuests = s.quests;
    lastKills = s.totalKills;
    lastEarned = s.totalGrindEarned;
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      const cur = useGameStore.getState();
      savePersisted({
        quests: cur.quests,
        totalKills: cur.totalKills,
        totalGrindEarned: cur.totalGrindEarned,
      });
    }, 500);
  });
}
