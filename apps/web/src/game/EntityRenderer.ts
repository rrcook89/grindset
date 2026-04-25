import { Graphics, Container, Text } from "pixi.js";
import type { Player } from "../net/types";
import { TILE_SIZE } from "./TileRenderer";

// Sprite bounding box per art-pipeline spec: 64×96px
const SPRITE_W = 64;
const SPRITE_H = 96;

// Palette (02-branding.md)
const COLOR_SELF_BODY   = 0xf5c14b; // ingot gold — bright body
const COLOR_SELF_HAT    = 0xd4a017; // slightly darker hat brim
const COLOR_OTHER_BODY  = 0xa07820; // muted gold body
const COLOR_OTHER_HAT   = 0x7a5c10; // muted gold hat
const COLOR_HP_BG       = 0xe04545; // loss red — empty HP
const COLOR_HP_FG       = 0x3bd67a; // gain green — filled HP

const HP_BAR_W  = 32;
const HP_BAR_H  = 4;
const HP_BAR_OX = (SPRITE_W - HP_BAR_W) / 2; // x offset within bounding box
const HP_BAR_OY = -6;                          // above sprite top

// Server tick is 400 ms — that's the window we lerp positions over.
const SERVER_TICK_MS = 400;
// Bob amplitude in px while walking.
const BOB_AMP_PX = 3;

const SWING_DURATION_MS = 220;
const SWING_DISTANCE_PX = 8;

export interface MobEntity {
  id: number;
  kind: string; // mob_def_id e.g. "marsh_rat"
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}

interface SpriteEntry {
  g: Graphics;
  hpBar: Graphics;
  /** Optional name label drawn above the HP bar. */
  label: Text | null;
  // Lerp source / target in PIXEL space (top-left of bounding box).
  srcPxX: number;
  srcPxY: number;
  tgtPxX: number;
  tgtPxY: number;
  moveStart: number; // performance.now() when this lerp began
  // Last logical tile so we can detect changes.
  prevTileX: number;
  prevTileY: number;
}

interface SwingState {
  attackerId: number;
  /** Direction unit vector toward target */
  dirX: number;
  dirY: number;
  born: number;
}

function tileToPx(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: tileX * TILE_SIZE + (TILE_SIZE - SPRITE_W) / 2,
    y: tileY * TILE_SIZE + (TILE_SIZE - SPRITE_H) / 2,
  };
}

export class EntityRenderer {
  readonly container: Container;
  private sprites = new Map<number, SpriteEntry>();
  private swing: SwingState | null = null;

  constructor() {
    this.container = new Container();
  }

  /** Trigger a lunge animation on the attacker's sprite toward the target tile. */
  setSwing(attackerId: number, attackerX: number, attackerY: number, targetX: number, targetY: number): void {
    const dx = targetX - attackerX;
    const dy = targetY - attackerY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    this.swing = {
      attackerId,
      dirX: dx / len,
      dirY: dy / len,
      born: performance.now(),
    };
  }

  /**
   * Per-frame animation. tick() is the SOLE writer of sprite/hpBar/label
   * positions: it lerps from each entry's src→target pixel position over
   * SERVER_TICK_MS, adds a sin-bob while moving, and adds a sin-lunge for
   * the active swing state.
   */
  tick(deltaMs: number): void {
    void deltaMs;
    const now = performance.now();

    let activeSwingId: number | null = null;
    let lungeOffX = 0;
    let lungeOffY = 0;
    if (this.swing) {
      const t = (now - this.swing.born) / SWING_DURATION_MS;
      if (t >= 1) {
        this.swing = null;
      } else {
        const a = Math.sin(t * Math.PI); // 0 → 1 → 0
        activeSwingId = this.swing.attackerId;
        lungeOffX = this.swing.dirX * SWING_DISTANCE_PX * a;
        lungeOffY = this.swing.dirY * SWING_DISTANCE_PX * a;
      }
    }

    for (const [id, entry] of this.sprites) {
      // Lerp source → target.
      const t = Math.max(0, Math.min(1, (now - entry.moveStart) / SERVER_TICK_MS));
      const baseX = entry.srcPxX + (entry.tgtPxX - entry.srcPxX) * t;
      const baseY = entry.srcPxY + (entry.tgtPxY - entry.srcPxY) * t;

      // Bob: sine while interpolating, settle to 0 when at target.
      const moving = t < 1;
      const bob = moving ? Math.sin(t * Math.PI * 2) * BOB_AMP_PX : 0;

      // Lunge: only on the attacker's sprite, on top of base + bob.
      const lx = id === activeSwingId ? lungeOffX : 0;
      const ly = id === activeSwingId ? lungeOffY : 0;

      entry.g.x = baseX + lx;
      entry.g.y = baseY + bob + ly;
      entry.hpBar.x = baseX + lx;
      entry.hpBar.y = baseY + bob + ly;
      if (entry.label) {
        entry.label.x = baseX + lx + SPRITE_W / 2;
        entry.label.y = baseY + bob + ly - 14;
      }
    }
  }

  updatePlayers(localPlayer: Player | null, others: Map<number, Player>, names: Map<number, string>): void {
    const seen = new Set<number>();

    if (localPlayer) {
      seen.add(localPlayer.id);
      this.upsertPlayer(localPlayer.id, localPlayer.x, localPlayer.y, true, names.get(localPlayer.id) ?? null);
    }

    for (const [id, player] of others) {
      seen.add(id);
      this.upsertPlayer(id, player.x, player.y, false, names.get(id) ?? null);
    }

    this.cullUnseen(seen);
  }

  updateMobs(mobs: Map<number, MobEntity>): void {
    const seen = new Set<number>();

    for (const [id, mob] of mobs) {
      seen.add(id);
      this.upsertMob(id, mob.x, mob.y, mob.hp, mob.maxHp);
    }

    this.cullUnseen(seen);
  }

  private cullUnseen(seen: Set<number>): void {
    for (const [id, entry] of this.sprites) {
      if (!seen.has(id)) {
        this.container.removeChild(entry.g);
        this.container.removeChild(entry.hpBar);
        if (entry.label) {
          this.container.removeChild(entry.label);
          entry.label.destroy();
        }
        entry.g.destroy();
        entry.hpBar.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private getOrCreate(id: number, initialPx: { x: number; y: number }): SpriteEntry {
    let entry = this.sprites.get(id);
    if (!entry) {
      const g = new Graphics();
      const hpBar = new Graphics();
      entry = {
        g,
        hpBar,
        label: null,
        srcPxX: initialPx.x,
        srcPxY: initialPx.y,
        tgtPxX: initialPx.x,
        tgtPxY: initialPx.y,
        moveStart: performance.now() - SERVER_TICK_MS, // already arrived
        prevTileX: -1,
        prevTileY: -1,
      };
      this.sprites.set(id, entry);
      this.container.addChild(hpBar);
      this.container.addChild(g);
    }
    return entry;
  }

  private retargetIfMoved(entry: SpriteEntry, tileX: number, tileY: number): void {
    if (tileX === entry.prevTileX && tileY === entry.prevTileY) return;
    entry.prevTileX = tileX;
    entry.prevTileY = tileY;
    const tgt = tileToPx(tileX, tileY);
    // Snapshot whatever the sprite is showing right now so the lerp picks up
    // mid-flight if multiple ticks land before the previous lerp completed.
    entry.srcPxX = entry.g.x === 0 && entry.g.y === 0 ? tgt.x : entry.g.x;
    entry.srcPxY = entry.g.x === 0 && entry.g.y === 0 ? tgt.y : entry.g.y;
    entry.tgtPxX = tgt.x;
    entry.tgtPxY = tgt.y;
    entry.moveStart = performance.now();
  }

  private upsertPlayer(id: number, tileX: number, tileY: number, isSelf: boolean, name: string | null): void {
    const startPx = tileToPx(tileX, tileY);
    const entry = this.getOrCreate(id, startPx);
    this.retargetIfMoved(entry, tileX, tileY);

    const bodyColor = isSelf ? COLOR_SELF_BODY : COLOR_OTHER_BODY;
    const hatColor  = isSelf ? COLOR_SELF_HAT  : COLOR_OTHER_HAT;

    const g = entry.g;
    g.clear();

    // Body: rounded rect, occupies lower 60px of bounding box
    const bodyX = 12;
    const bodyY = 36;
    const bodyW = SPRITE_W - 24;
    const bodyH = 50;
    g.roundRect(bodyX, bodyY, bodyW, bodyH, 6).fill({ color: bodyColor });
    if (isSelf) {
      g.roundRect(bodyX, bodyY, bodyW, bodyH, 6).stroke({ color: 0xffffff, width: 2 });
    }

    // Head
    const headCX = SPRITE_W / 2;
    const headCY = 22;
    const headR = 14;
    g.circle(headCX, headCY, headR).fill({ color: bodyColor });
    if (isSelf) {
      g.circle(headCX, headCY, headR).stroke({ color: 0xffffff, width: 2 });
    }

    // Wizard hat
    g.rect(headCX - 16, headCY - headR + 2, 32, 5).fill({ color: hatColor });
    g.rect(headCX - 7, headCY - headR - 14, 14, 16).fill({ color: hatColor });
    g.rect(headCX - 4, headCY - headR - 22, 8, 10).fill({ color: hatColor });

    // Name label
    this.applyLabel(entry, name, isSelf ? 0xffffff : 0xc8a040);

    this.drawHpBar(entry.hpBar, 1, 1);
  }

  private upsertMob(id: number, tileX: number, tileY: number, hp: number, maxHp: number): void {
    const startPx = tileToPx(tileX, tileY);
    const entry = this.getOrCreate(id, startPx);
    this.retargetIfMoved(entry, tileX, tileY);

    const g = entry.g;
    g.clear();
    // Tier visualisation by maxHP — bigger + darker for higher tiers.
    let radius = 12, body = 0xe04545, outline = 0x800000;
    if (maxHp >= 100) { radius = 22; body = 0x2a1030; outline = 0x100018; }       // bog_horror
    else if (maxHp >= 60) { radius = 20; body = 0x6a6a78; outline = 0x303040; }    // dwarf_thug
    else if (maxHp >= 30) { radius = 18; body = 0x8a3060; outline = 0x501030; }    // mire_bandit
    else if (maxHp >= 15) { radius = 16; body = 0xc04535; outline = 0x602010; }    // bog_goblin
    g.circle(SPRITE_W / 2, SPRITE_H / 2, radius).fill({ color: body });
    g.circle(SPRITE_W / 2, SPRITE_H / 2, radius).stroke({ color: outline, width: 2 });

    this.applyLabel(entry, mobNameForMaxHp(maxHp), 0xe8b0a0);

    this.drawHpBar(entry.hpBar, hp, maxHp);
  }

  private applyLabel(entry: SpriteEntry, text: string | null, color: number): void {
    if (!text) {
      if (entry.label) {
        this.container.removeChild(entry.label);
        entry.label.destroy();
        entry.label = null;
      }
      return;
    }
    if (!entry.label) {
      entry.label = new Text({
        text,
        style: {
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: "bold",
          fill: color,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      entry.label.anchor.set(0.5, 1);
      this.container.addChild(entry.label);
    } else if (entry.label.text !== text) {
      entry.label.text = text;
    }
  }

  /**
   * Draw HP bar at relative origin (0,0). hpBar.x/y is positioned by tick().
   */
  private drawHpBar(hpBar: Graphics, hp: number, maxHp: number): void {
    const fill = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;

    hpBar.clear();
    hpBar.rect(HP_BAR_OX, HP_BAR_OY, HP_BAR_W, HP_BAR_H).fill({ color: COLOR_HP_BG });
    if (fill > 0) {
      hpBar.rect(HP_BAR_OX, HP_BAR_OY, Math.round(HP_BAR_W * fill), HP_BAR_H).fill({ color: COLOR_HP_FG });
    }
  }
}

function mobNameForMaxHp(maxHp: number): string {
  if (maxHp >= 100) return "Bog Horror";
  if (maxHp >= 60) return "Dwarf Thug";
  if (maxHp >= 30) return "Bandit";
  if (maxHp >= 15) return "Goblin";
  return "Marsh Rat";
}
