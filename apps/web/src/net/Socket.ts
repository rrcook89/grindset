import {
  OP,
  encodeHello,
  decodeWelcome,
  decodePositionDelta,
  decodeError,
  decodeCombatHit,
  decodeCombatDeath,
  decodeSkillTick,
  decodeSkillLevelUp,
  decodeInventoryDelta,
  decodeChatMessage,
  decodeWalletBalance,
  decodeWalletLedgerEntry,
  readOpcode,
} from "./protocol";
import { useGameStore } from "../state/store";
import type { InventoryItem, ChatChannel, Skill } from "./types";
import { itemDisplay } from "./itemDefs";

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

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

const CHAT_CHANNELS: ChatChannel[] = ["global", "zone", "guild", "trade"];

// Mirrors the server XP curve in apps/server/internal/skills/skills.go
const XP_TABLE: number[] = [
  0, 80, 230, 530, 1100, 1750, 2540, 3410, 4400, 5500,
  6900, 8650, 10750, 13300, 16500, 20200, 24600, 29700, 35500, 42000,
];

function xpForLevel(n: number): number {
  if (n <= 1) return 0;
  if (n > 20) return XP_TABLE[19];
  return XP_TABLE[n - 1];
}

function levelForXP(xp: number): number {
  let lvl = 1;
  while (lvl < 20 && XP_TABLE[lvl] <= xp) lvl++;
  return lvl;
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private devUser: string;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private destroyed = false;

  constructor(wsUrl: string, devUser: string) {
    this.wsUrl = wsUrl;
    this.devUser = devUser;
  }

  connect(): void {
    // Guard: prevent late Game.create.then() from opening a socket on an
    // already-destroyed instance (React StrictMode double-mount race).
    if (this.destroyed) return;
    const jwt = useGameStore.getState().jwt;
    const authParam = jwt
      ? `token=${encodeURIComponent(jwt)}`
      : `dev_user=${encodeURIComponent(this.devUser)}`;
    const url = `${this.wsUrl}?${authParam}`;
    useGameStore.getState().setConnectionStatus("connecting");

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      ws.send(encodeHello(this.devUser));
    };

    ws.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
      this.handleMessage(evt.data);
    };

    ws.onerror = () => {
      useGameStore.getState().setConnectionStatus("error");
    };

    ws.onclose = () => {
      if (this.destroyed) return;
      useGameStore.getState().setConnectionStatus("disconnected");
      this.scheduleReconnect();
    };
  }

  private handleMessage(buf: ArrayBuffer): void {
    const opcode = readOpcode(buf);
    const store = useGameStore.getState();

    switch (opcode) {
      case OP.WELCOME: {
        const p = decodeWelcome(buf);
        store.setConnectionStatus("connected");
        store.setLocalPlayer({ id: p.playerId, x: p.spawnX, y: p.spawnY });
        break;
      }

      case OP.POSITION_DELTA: {
        const p = decodePositionDelta(buf);
        store.applyPositionDelta(p.entities);
        break;
      }

      case OP.COMBAT_HIT: {
        const p = decodeCombatHit(buf);
        // Float a hit splat over the target.
        store.applyHitSplat({
          id: `${Date.now()}-${Math.random()}`,
          entityId: p.targetId,
          amount: p.damage,
          type: p.damage === 0 ? "heal" : "damage",
          timestamp: Date.now(),
        });
        break;
      }

      case OP.COMBAT_DEATH: {
        const p = decodeCombatDeath(buf);
        // Drop the target frame if it was the killed mob.
        const tgt = useGameStore.getState().combatTarget;
        if (tgt && tgt.entityId === p.entityId) {
          store.setCombatTarget(null);
        }
        // Mob will disappear from the next PositionDelta — no extra action.
        break;
      }

      case OP.SKILL_TICK: {
        const p = decodeSkillTick(buf);
        const name = SKILL_NAMES[p.skillId];
        if (name) {
          const level = levelForXP(p.totalXP);
          const skill: Skill = {
            name,
            level,
            xp: p.totalXP,
            xpToNextLevel: xpForLevel(level + 1) - p.totalXP,
          };
          store.applySkillUpdate(skill);
          // eslint-disable-next-line no-console
          console.log(`[GRINDSET] +${p.xpGained} ${name} XP — got ${p.itemDefId}`);
        }
        break;
      }

      case OP.SKILL_LEVEL_UP: {
        const p = decodeSkillLevelUp(buf);
        const name = SKILL_NAMES[p.skillId];
        if (name) {
          store.setLevelUpFlash(name);
          setTimeout(() => store.setLevelUpFlash(null), 3000);
        }
        break;
      }

      case OP.INVENTORY_FULL:
      case OP.INVENTORY_DELTA: {
        const p = decodeInventoryDelta(buf);
        const items: InventoryItem[] = p.items
          .filter((raw) => raw.itemDefId !== "")
          .map((raw) => {
            const display = itemDisplay(raw.itemDefId);
            return {
              slotIndex: raw.slotIndex,
              itemId: 0,
              name: display.name,
              quantity: raw.quantity,
              color: display.color,
            };
          });
        store.setInventory(items);
        break;
      }

      case OP.BANK_OPEN: {
        store.setBankOpen(true);
        break;
      }

      case OP.BANK_CLOSE: {
        store.setBankOpen(false);
        break;
      }

      case OP.CHAT_MESSAGE: {
        const p = decodeChatMessage(buf);
        const channel: ChatChannel = CHAT_CHANNELS[p.channel] ?? "global";
        store.addChatMessage({
          id: `${Date.now()}-${Math.random()}`,
          channel,
          senderName: p.senderName,
          text: p.text,
          timestamp: Date.now(),
        });
        break;
      }

      case OP.WALLET_BALANCE: {
        const p = decodeWalletBalance(buf);
        store.setWalletBalance(p.balance);
        break;
      }

      case OP.WALLET_LEDGER_ENTRY: {
        const p = decodeWalletLedgerEntry(buf);
        store.addLedgerEntry({
          id: String(p.entryId),
          direction: p.direction === 0 ? "in" : "out",
          amount: p.amount,
          description: p.description,
          timestamp: p.timestamp,
        });
        break;
      }

      case OP.ERROR: {
        const p = decodeError(buf);
        console.error(`[GRINDSET] Server error ${p.code}: ${p.message}`);
        break;
      }

      default:
        break;
    }
  }

  sendRaw(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.destroyed) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}
