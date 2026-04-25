import { Graphics, Container } from "pixi.js";
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
const COLOR_MOB         = 0xe04545; // loss red for mobs
const COLOR_HP_BG       = 0xe04545; // loss red — empty HP
const COLOR_HP_FG       = 0x3bd67a; // gain green — filled HP

const HP_BAR_W  = 32;
const HP_BAR_H  = 4;
const HP_BAR_OX = (SPRITE_W - HP_BAR_W) / 2; // x offset within bounding box
const HP_BAR_OY = -6;                          // above sprite top

// Animation: two y-offsets, alternating every 200 ms while moving
const BOB_OFFSET = [0, -3] as const;
const ANIM_INTERVAL_MS = 200;

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
  animFrame: number;   // 0 or 1
  lastAnim: number;    // performance.now() timestamp
  moving: boolean;
  prevX: number;
  prevY: number;
  // Last lunge offset already applied to g.x/y — subtracted before reapplying.
  lungeOffX: number;
  lungeOffY: number;
}

interface SwingState {
  attackerId: number;
  /** Direction unit vector toward target */
  dirX: number;
  dirY: number;
  born: number;
}

const SWING_DURATION_MS = 220;
const SWING_DISTANCE_PX = 8;

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

  /** Called every ticker frame with delta in ms */
  tick(deltaMs: number): void {
    // deltaMs unused directly; we use wall-clock timestamps for determinism
    void deltaMs;
    const now = performance.now();
    for (const [, entry] of this.sprites) {
      if (entry.moving && now - entry.lastAnim >= ANIM_INTERVAL_MS) {
        entry.animFrame = (entry.animFrame + 1) % 2;
        entry.lastAnim = now;
        // The y-position update happens in next updatePlayers call;
        // we can nudge the existing graphic directly.
        entry.g.y += BOB_OFFSET[entry.animFrame] - BOB_OFFSET[(entry.animFrame + 1) % 2];
      }
    }

    // Lunge: apply swing offset to attacker's sprite, undo previous offset first.
    if (this.swing) {
      const t = (now - this.swing.born) / SWING_DURATION_MS;
      const entry = this.sprites.get(this.swing.attackerId);
      if (entry) {
        // Undo previous offset
        entry.g.x -= entry.lungeOffX;
        entry.g.y -= entry.lungeOffY;
        entry.hpBar.x -= entry.lungeOffX;
        entry.hpBar.y -= entry.lungeOffY;
        if (t >= 1) {
          entry.lungeOffX = 0;
          entry.lungeOffY = 0;
          this.swing = null;
        } else {
          // sin(πt): 0 → 1 → 0
          const a = Math.sin(t * Math.PI);
          entry.lungeOffX = this.swing.dirX * SWING_DISTANCE_PX * a;
          entry.lungeOffY = this.swing.dirY * SWING_DISTANCE_PX * a;
          entry.g.x += entry.lungeOffX;
          entry.g.y += entry.lungeOffY;
          entry.hpBar.x += entry.lungeOffX;
          entry.hpBar.y += entry.lungeOffY;
        }
      } else if (t >= 1) {
        this.swing = null;
      }
    }
  }

  updatePlayers(localPlayer: Player | null, others: Map<number, Player>): void {
    const seen = new Set<number>();

    if (localPlayer) {
      seen.add(localPlayer.id);
      this.upsertPlayer(localPlayer.id, localPlayer.x, localPlayer.y, true);
    }

    for (const [id, player] of others) {
      seen.add(id);
      this.upsertPlayer(id, player.x, player.y, false);
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
        entry.g.destroy();
        entry.hpBar.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private getOrCreate(id: number): SpriteEntry {
    let entry = this.sprites.get(id);
    if (!entry) {
      const g = new Graphics();
      const hpBar = new Graphics();
      entry = {
        g,
        hpBar,
        animFrame: 0,
        lastAnim: performance.now(),
        moving: false,
        prevX: -1,
        prevY: -1,
        lungeOffX: 0,
        lungeOffY: 0,
      };
      this.sprites.set(id, entry);
      this.container.addChild(hpBar);
      this.container.addChild(g);
    }
    return entry;
  }

  private upsertPlayer(id: number, tileX: number, tileY: number, isSelf: boolean): void {
    const entry = this.getOrCreate(id);
    const wasMoving = entry.moving;
    entry.moving = tileX !== entry.prevX || tileY !== entry.prevY;
    if (!wasMoving && entry.moving) entry.lastAnim = performance.now();
    entry.prevX = tileX;
    entry.prevY = tileY;

    const bobY = entry.moving ? BOB_OFFSET[entry.animFrame] : 0;
    const bodyColor = isSelf ? COLOR_SELF_BODY : COLOR_OTHER_BODY;
    const hatColor  = isSelf ? COLOR_SELF_HAT  : COLOR_OTHER_HAT;

    const g = entry.g;
    g.clear();

    // Body: rounded rect, occupies lower 60px of bounding box
    const bodyX = 12;
    const bodyY = 36 + bobY;
    const bodyW = SPRITE_W - 24;
    const bodyH = 50;
    g.roundRect(bodyX, bodyY, bodyW, bodyH, 6).fill({ color: bodyColor });
    if (isSelf) {
      g.roundRect(bodyX, bodyY, bodyW, bodyH, 6).stroke({ color: 0xffffff, width: 2 });
    }

    // Head: circle
    const headCX = SPRITE_W / 2;
    const headCY = 22 + bobY;
    const headR = 14;
    g.circle(headCX, headCY, headR).fill({ color: bodyColor });
    if (isSelf) {
      g.circle(headCX, headCY, headR).stroke({ color: 0xffffff, width: 2 });
    }

    // Wizard hat: triangle-ish brim + cone
    // Brim: flat rect
    g.rect(headCX - 16, headCY - headR + 2 + bobY, 32, 5).fill({ color: hatColor });
    // Cone: two triangles approximated as a thin rect narrowing upward
    g.rect(headCX - 7, headCY - headR - 14 + bobY, 14, 16).fill({ color: hatColor });
    g.rect(headCX - 4, headCY - headR - 22 + bobY, 8, 10).fill({ color: hatColor });

    // Position bounding box (base — lunge offset is reapplied by tick())
    g.x = tileX * TILE_SIZE + (TILE_SIZE - SPRITE_W) / 2;
    g.y = tileY * TILE_SIZE + (TILE_SIZE - SPRITE_H) / 2;
    entry.lungeOffX = 0;
    entry.lungeOffY = 0;

    this.drawHpBar(entry.hpBar, tileX, tileY, 1, 1);
  }

  private upsertMob(id: number, tileX: number, tileY: number, hp: number, maxHp: number): void {
    const entry = this.getOrCreate(id);
    entry.moving = tileX !== entry.prevX || tileY !== entry.prevY;
    entry.prevX = tileX;
    entry.prevY = tileY;

    const g = entry.g;
    g.clear();
    // Red circle, slightly larger than old placeholder
    g.circle(SPRITE_W / 2, SPRITE_H / 2, 18).fill({ color: COLOR_MOB });
    g.circle(SPRITE_W / 2, SPRITE_H / 2, 18).stroke({ color: 0x800000, width: 2 });

    g.x = tileX * TILE_SIZE + (TILE_SIZE - SPRITE_W) / 2;
    g.y = tileY * TILE_SIZE + (TILE_SIZE - SPRITE_H) / 2;
    entry.lungeOffX = 0;
    entry.lungeOffY = 0;

    this.drawHpBar(entry.hpBar, tileX, tileY, hp, maxHp);
  }

  private drawHpBar(hpBar: Graphics, tileX: number, tileY: number, hp: number, maxHp: number): void {
    const fill = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
    const pxX = tileX * TILE_SIZE + (TILE_SIZE - SPRITE_W) / 2 + HP_BAR_OX;
    const pxY = tileY * TILE_SIZE + (TILE_SIZE - SPRITE_H) / 2 + HP_BAR_OY;

    hpBar.clear();
    // Background (empty)
    hpBar.rect(pxX, pxY, HP_BAR_W, HP_BAR_H).fill({ color: COLOR_HP_BG });
    // Foreground (filled)
    if (fill > 0) {
      hpBar.rect(pxX, pxY, Math.round(HP_BAR_W * fill), HP_BAR_H).fill({ color: COLOR_HP_FG });
    }
  }
}
