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
        // Swing animation — works for both player→mob and mob→player.
        store.triggerSwing(p.attackerId, p.targetId);
        // Float a hit splat over the target.
        store.applyHitSplat({
          id: `${Date.now()}-${Math.random()}`,
          entityId: p.targetId,
          amount: p.damage,
          type: p.damage === 0 ? "heal" : "damage",
          timestamp: Date.now(),
        });
        // Canvas damage float at the target's world position.
        const stateNow = useGameStore.getState();
        const targetMob = stateNow.mobs.get(p.targetId);
        const targetTile = targetMob
          ? { x: targetMob.x, y: targetMob.y }
          : p.targetId === stateNow.localPlayer?.id && stateNow.localPlayer
            ? { x: stateNow.localPlayer.x, y: stateNow.localPlayer.y }
            : null;
        if (targetTile) {
          // Server signals a crit by sending damage > maxHit.
          const isCrit = p.damage > 0 && p.damage > p.maxHit;
          let floatText: string;
          let floatColor: number;
          if (p.damage === 0) {
            floatText = "miss";
            floatColor = 0x9ca3af; // grey
          } else if (isCrit) {
            floatText = `CRIT! -${p.damage}`;
            floatColor = 0xf5c14b; // ingot-gold
          } else {
            floatText = `-${p.damage}`;
            floatColor = 0xe04545; // loss-red
          }
          store.pushFloat({
            tileX: targetTile.x,
            tileY: targetTile.y,
            text: floatText,
            color: floatColor,
          });
        }
        // HP propagation:
        const lp = useGameStore.getState().localPlayer;
        if (lp && p.targetId === lp.id) {
          // Local player took damage — update player HP.
          useGameStore.setState((s) =>
            s.localPlayer
              ? { localPlayer: { ...s.localPlayer, hp: p.targetHp, maxHp: p.targetMaxHp } }
              : s,
          );
        } else if (lp && p.attackerId === lp.id) {
          // Local player just hit a mob — show/refresh the target frame.
          store.setCombatTarget({
            entityId: p.targetId,
            name: "Target",
            hp: p.targetHp,
            maxHp: p.targetMaxHp,
          });
          // Quest: count crits for "Swing School".
          if (p.damage > 0 && p.damage > p.maxHit) {
            store.incQuestObjective("swing_school", 0, 1);
          }
        }
        break;
      }

      case OP.COMBAT_DEATH: {
        const p = decodeCombatDeath(buf);
        // Drop the target frame if it was the killed mob.
        const tgt = useGameStore.getState().combatTarget;
        if (tgt && tgt.entityId === p.entityId) {
          store.setCombatTarget(null);
        }
        // Quest: local player killed something → bump welcome objective[1].
        const lpDeath = useGameStore.getState().localPlayer;
        if (lpDeath && p.killerId === lpDeath.id && p.entityId !== lpDeath.id) {
          store.incQuestObjective("welcome_to_mireholm", 1, 1);
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
        }
        // Float visuals over the local player when something was awarded.
        const lp = useGameStore.getState().localPlayer;
        if (lp) {
          if (p.xpGained > 0 && name) {
            store.pushFloat({
              tileX: lp.x,
              tileY: lp.y,
              text: `+${p.xpGained} ${name} XP`,
              color: 0x3bd67a, // gain-green
            });
          }
          if (p.grindDropped > 0n) {
            const tokens = Number(p.grindDropped) / 1e9;
            store.pushFloat({
              tileX: lp.x,
              tileY: lp.y,
              text: `+${tokens.toFixed(3)} $GRIND`,
              color: 0xf5c14b, // ingot-gold
            });
          }
          if (p.itemDefId) {
            const display = itemDisplay(p.itemDefId);
            store.pushFloat({
              tileX: lp.x,
              tileY: lp.y,
              text: `+1 ${display.name}`,
              color: 0xe8d090, // parchment
            });
            // Quest: count ore mined for "Welcome to Mireholm".
            if (p.itemDefId.startsWith("ore_")) {
              store.incQuestObjective("welcome_to_mireholm", 0, 1);
            }
          }
        }
        // Quest: track Melee level for "Swing School".
        if (name === "Melee") {
          const newLevel = levelForXP(p.totalXP);
          const obj = useGameStore.getState().quests.find((q) => q.id === "swing_school")?.objectives[1];
          if (obj && newLevel > obj.current) {
            store.incQuestObjective("swing_school", 1, newLevel - obj.current);
          }
        }
        break;
      }

      case OP.SKILL_LEVEL_UP: {
        const p = decodeSkillLevelUp(buf);
        const name = SKILL_NAMES[p.skillId];
        if (name) {
          store.setLevelUpFlash(name);
          setTimeout(() => store.setLevelUpFlash(null), 3000);
          // Big celebratory float over the player.
          const lp = useGameStore.getState().localPlayer;
          if (lp) {
            store.pushFloat({
              tileX: lp.x,
              tileY: lp.y,
              text: `LEVEL UP! ${name} → ${p.newLevel}`,
              color: 0xf5c14b, // ingot-gold
            });
          }
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
