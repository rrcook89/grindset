import { Graphics, Container, Text } from "pixi.js";
import type { Player } from "../net/types";
import { tileToIso, tileDepth, HALF_H } from "./projection";

// Sprite bounding box. The sprite is drawn so its FEET sit at the tile
// centre — i.e. anchor.set(0.5, 1) on the bounding box.
const SPRITE_W = 56;
const SPRITE_H = 86;

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
const HURT_SHAKE_DURATION_MS = 220;
const HURT_SHAKE_AMPLITUDE_PX = 4;

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
  /** Soft drop shadow that sells the iso depth — drawn under the sprite. */
  shadow: Graphics;
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
  /** +1 = facing screen-right (default), -1 = mirrored facing screen-left. */
  facing: 1 | -1;
  /** performance.now() when this sprite last took damage; 0 = no shake. */
  hurtAt: number;
}

interface SwingState {
  attackerId: number;
  /** Direction unit vector toward target */
  dirX: number;
  dirY: number;
  born: number;
}

/**
 * Tile centre → top-left pixel of a SPRITE_W × SPRITE_H bounding box. The
 * sprite is drawn so its bottom-centre (the feet) lines up with the diamond
 * tile centre, plus a small downward offset so the sprite stands ON the
 * front edge of the diamond rather than floating above it.
 */
function tileToPx(tileX: number, tileY: number): { x: number; y: number } {
  const c = tileToIso(tileX, tileY);
  return {
    x: c.x - SPRITE_W / 2,
    y: c.y + HALF_H - SPRITE_H,
  };
}

export class EntityRenderer {
  readonly container: Container;
  private sprites = new Map<number, SpriteEntry>();
  private swing: SwingState | null = null;

  constructor() {
    this.container = new Container();
    // Iso depth-sort: sprites with larger (col + row) draw in front.
    this.container.sortableChildren = true;
  }

  /** Trigger a hurt-shake on the target sprite. Symmetric with the
   *  attacker's lunge — defender briefly oscillates horizontally. */
  triggerHurt(targetId: number): void {
    const entry = this.sprites.get(targetId);
    if (!entry) return;
    entry.hurtAt = performance.now();
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

      // Hurt shake: defender oscillates briefly. Damped sine so it
      // settles smoothly. Independent of lunge so a counter-attacking
      // mob can lunge AND shake (took a hit, now retaliating).
      // The same window also drives a red-flash tint on the sprite.
      let sx = 0;
      if (entry.hurtAt > 0) {
        const ht = (now - entry.hurtAt) / HURT_SHAKE_DURATION_MS;
        if (ht >= 1) {
          entry.hurtAt = 0;
          entry.g.tint = 0xffffff;
        } else {
          // 4 cycles in 1 unit; amplitude decays linearly.
          sx = Math.sin(ht * Math.PI * 8) * HURT_SHAKE_AMPLITUDE_PX * (1 - ht);
          // Red flash that fades back to neutral white. RGB channels
          // each lerp from a hot red toward 0xff so the tint multiplier
          // pushes everything red at t=0 and back to identity at t=1.
          const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
          const r = 0xff;
          const gC = lerp(0x60, 0xff, ht);
          const bC = lerp(0x60, 0xff, ht);
          entry.g.tint = (r << 16) | (gC << 8) | bC;
        }
      } else if (entry.g.tint !== 0xffffff) {
        entry.g.tint = 0xffffff;
      }

      // Mirror the sprite around its centre when facing screen-left.
      // scale.x flips around the local origin (0, 0), so we offset g.x by
      // SPRITE_W to keep the visual centred on the tile. hpBar + label are
      // not mirrored — they always read left-to-right.
      entry.g.scale.x = entry.facing;
      entry.g.x = baseX + lx + sx + (entry.facing < 0 ? SPRITE_W : 0);
      entry.g.y = baseY + bob + ly;
      entry.hpBar.x = baseX + lx + sx;
      entry.hpBar.y = baseY + bob + ly;
      if (entry.label) {
        entry.label.x = baseX + lx + sx + SPRITE_W / 2;
        entry.label.y = baseY + bob + ly - 14;
      }

      // Shadow stays glued to the feet — bottom-centre of the sprite box.
      // No bob applied so the shadow's the reference frame for the bob.
      entry.shadow.x = baseX + lx + SPRITE_W / 2;
      entry.shadow.y = baseY + ly + SPRITE_H;

      // Iso depth: prefer the lerp's CURRENT tile (round to nearest).
      const liveCol = Math.round(entry.prevTileX);
      const liveRow = Math.round(entry.prevTileY);
      const baseZ = tileDepth(liveCol, liveRow) * 10;
      entry.shadow.zIndex = baseZ - 1;
      entry.g.zIndex = baseZ;
      entry.hpBar.zIndex = baseZ + 1;
      if (entry.label) entry.label.zIndex = baseZ + 2;
    }
  }

  updatePlayers(
    localPlayer: Player | null,
    others: Map<number, Player>,
    names: Map<number, string>,
    selfWeapon: string | null = null,
  ): void {
    const seen = new Set<number>();

    if (localPlayer) {
      seen.add(localPlayer.id);
      this.upsertPlayer(localPlayer.id, localPlayer.x, localPlayer.y, true, names.get(localPlayer.id) ?? null, selfWeapon);
    }

    for (const [id, player] of others) {
      seen.add(id);
      this.upsertPlayer(id, player.x, player.y, false, names.get(id) ?? null, null);
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
        this.container.removeChild(entry.shadow);
        if (entry.label) {
          this.container.removeChild(entry.label);
          entry.label.destroy();
        }
        entry.g.destroy();
        entry.hpBar.destroy();
        entry.shadow.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private getOrCreate(id: number, initialPx: { x: number; y: number }): SpriteEntry {
    let entry = this.sprites.get(id);
    if (!entry) {
      const g = new Graphics();
      const hpBar = new Graphics();
      const shadow = new Graphics();
      // Pre-draw shadow once — it's a static ellipse re-positioned per frame.
      shadow.ellipse(0, 0, 22, 7).fill({ color: 0x000000, alpha: 0.35 });
      entry = {
        g,
        shadow,
        hpBar,
        label: null,
        srcPxX: initialPx.x,
        srcPxY: initialPx.y,
        tgtPxX: initialPx.x,
        tgtPxY: initialPx.y,
        moveStart: performance.now() - SERVER_TICK_MS, // already arrived
        prevTileX: -1,
        prevTileY: -1,
        facing: 1,
        hurtAt: 0,
      };
      this.sprites.set(id, entry);
      // Add in render-order: shadow → hpBar → g (so shadow stays under feet,
      // sprite paints over HP bar at its base only because hpBar zIndex is
      // also bumped in tick()).
      this.container.addChild(shadow);
      this.container.addChild(hpBar);
      this.container.addChild(g);
    }
    return entry;
  }

  private retargetIfMoved(entry: SpriteEntry, tileX: number, tileY: number): void {
    if (tileX === entry.prevTileX && tileY === entry.prevTileY) return;
    // Direction in iso screen-space is sign of (col - row) deltas. Only flip
    // the facing when there's a horizontal component — pure vertical moves
    // (col+row changes only) don't change facing.
    if (entry.prevTileX !== -1) {
      const dCol = tileX - entry.prevTileX;
      const dRow = tileY - entry.prevTileY;
      const screenDx = dCol - dRow;
      if (screenDx > 0) entry.facing = 1;
      else if (screenDx < 0) entry.facing = -1;
    }
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

  private upsertPlayer(id: number, tileX: number, tileY: number, isSelf: boolean, name: string | null, weapon: string | null = null): void {
    const startPx = tileToPx(tileX, tileY);
    const entry = this.getOrCreate(id, startPx);
    this.retargetIfMoved(entry, tileX, tileY);

    const bodyColor = isSelf ? COLOR_SELF_BODY : COLOR_OTHER_BODY;
    const hatColor  = isSelf ? COLOR_SELF_HAT  : COLOR_OTHER_HAT;
    // Lighting from upper-left → right side gets ~25% darker, left gets a
    // small highlight. Pure 3/4-perspective trick.
    const shade = (hex: number, mult: number): number => {
      const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * mult));
      const g = Math.min(255, Math.round(((hex >> 8) & 0xff) * mult));
      const b = Math.min(255, Math.round((hex & 0xff) * mult));
      return (r << 16) | (g << 8) | b;
    };
    const bodyShadow = shade(bodyColor, 0.7);
    const bodyHigh = shade(bodyColor, 1.18);
    const hatShadow = shade(hatColor, 0.7);

    const g = entry.g;
    g.clear();

    const cx = SPRITE_W / 2;
    const feetY = SPRITE_H - 4; // a touch off the bottom so shadow shows
    // Robe: trapezoid widening at the base — reads as a standing figure
    // from the iso angle far better than a flat rect.
    g.poly([
      cx - 9, 38,                  // left shoulder
      cx + 9, 38,                  // right shoulder
      cx + 18, feetY,              // right hem
      cx - 18, feetY,              // left hem
    ]).fill({ color: bodyColor });
    // Right-side robe shading
    g.poly([
      cx + 1, 38,
      cx + 9, 38,
      cx + 18, feetY,
      cx + 4, feetY,
    ]).fill({ color: bodyShadow });
    // Left-side robe highlight
    g.poly([
      cx - 9, 38,
      cx - 5, 38,
      cx - 14, feetY,
      cx - 18, feetY,
    ]).fill({ color: bodyHigh, alpha: 0.35 });

    // Belt
    g.rect(cx - 14, 56, 28, 3).fill({ color: hatShadow });

    // Sleeves: small rects either side of the body at shoulder height
    g.roundRect(cx - 16, 40, 7, 14, 2).fill({ color: bodyColor });
    g.roundRect(cx + 9, 40, 7, 14, 2).fill({ color: bodyShadow });

    // Head: oval, slightly wider than tall for iso readability.
    const headCX = cx;
    const headCY = 28;
    g.ellipse(headCX, headCY, 9, 10).fill({ color: 0xe8c896 }); // skin tone
    g.ellipse(headCX + 1, headCY + 1, 9, 10).fill({ color: shade(0xe8c896, 0.78), alpha: 0.5 });
    // Eyes (two dark dots facing camera)
    g.circle(headCX - 3, headCY - 1, 1.2).fill({ color: 0x100808 });
    g.circle(headCX + 3, headCY - 1, 1.2).fill({ color: 0x100808 });

    // Wizard hat: pointy cone + brim drawn as ellipses for the iso angle.
    // Brim
    g.ellipse(headCX, headCY - 8, 16, 5).fill({ color: hatColor });
    g.ellipse(headCX, headCY - 8, 16, 5).stroke({ color: hatShadow, width: 1 });
    // Cone (taper from brim to peak)
    g.poly([
      headCX - 11, headCY - 8,
      headCX + 11, headCY - 8,
      headCX + 2, headCY - 26,
      headCX - 2, headCY - 26,
    ]).fill({ color: hatColor });
    // Cone right-side shadow
    g.poly([
      headCX, headCY - 8,
      headCX + 11, headCY - 8,
      headCX + 2, headCY - 26,
      headCX, headCY - 26,
    ]).fill({ color: hatShadow });
    // Tip cap
    g.circle(headCX, headCY - 26, 2).fill({ color: hatShadow });

    // Self-marker: bright outline ring under the feet so the local player
    // is unambiguous in a crowd.
    if (isSelf) {
      g.ellipse(cx, feetY + 2, 18, 4).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
    }

    // Wielded weapon — drawn in the right hand (screen-right side at
    // shoulder height). Only the local player has a known weapon here;
    // remote players' weapons aren't broadcast yet.
    if (weapon) {
      drawWeapon(g, cx + 14, 50, weapon);
    }

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
    const cx = SPRITE_W / 2;
    const feetY = SPRITE_H - 4;

    if (maxHp >= 100) {
      drawBogHorror(g, cx, feetY);
    } else if (maxHp >= 60) {
      drawDwarfThug(g, cx, feetY);
    } else if (maxHp >= 30) {
      drawBandit(g, cx, feetY);
    } else if (maxHp >= 15) {
      drawGoblin(g, cx, feetY);
    } else {
      drawMarshRat(g, cx, feetY);
    }

    // Aggro marker — yellow "!" badge above hostile mobs (goblin tier
    // and up). Rats are passive and get no badge.
    if (maxHp >= 15) {
      const bx = cx + 14;
      const by = feetY - 60;
      g.poly([bx, by - 8, bx + 4, by + 4, bx - 4, by + 4]).fill({ color: 0xffd040 });
      g.poly([bx, by - 8, bx + 4, by + 4, bx - 4, by + 4]).stroke({ color: 0x4a2a00, width: 1 });
      g.rect(bx - 0.7, by - 5, 1.4, 5).fill({ color: 0x4a2a00 });
      g.circle(bx, by + 2, 0.8).fill({ color: 0x4a2a00 });
    }

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

/**
 * Render the equipped weapon in the player's right hand. Anchor (handX, handY)
 * is roughly where the wizard's right palm would be — drawing extends up
 * for swords, out for axes, point-down for daggers.
 */
function drawWeapon(g: Graphics, handX: number, handY: number, defID: string): void {
  switch (defID) {
    case "bronze_dagger": {
      // Short blade pointing down-and-out
      g.poly([
        handX - 1, handY,
        handX + 4, handY + 1,
        handX + 6, handY + 10,
        handX + 3, handY + 11,
      ]).fill({ color: 0xcd7f32 });
      // Hilt
      g.rect(handX - 2, handY - 2, 7, 3).fill({ color: 0x4a2a10 });
      // Pommel
      g.circle(handX - 1, handY - 2, 1.5).fill({ color: 0x8a6a40 });
      break;
    }
    case "iron_axe": {
      // Shaft
      g.rect(handX, handY - 14, 2, 22).fill({ color: 0x4a2a10 });
      // Axe head — angled blade
      g.poly([
        handX + 2, handY - 14,
        handX + 9, handY - 11,
        handX + 8, handY - 6,
        handX + 2, handY - 7,
      ]).fill({ color: 0x888888 });
      g.poly([
        handX + 2, handY - 14,
        handX + 9, handY - 11,
        handX + 8, handY - 6,
        handX + 2, handY - 7,
      ]).stroke({ color: 0x444444, width: 1 });
      // Highlight on the blade edge
      g.poly([
        handX + 5, handY - 13,
        handX + 9, handY - 11,
        handX + 7, handY - 9,
      ]).fill({ color: 0xc0c0c0, alpha: 0.6 });
      break;
    }
    case "steel_sword": {
      // Long blade pointing up
      g.poly([
        handX - 1, handY - 24,
        handX + 1, handY - 26,
        handX + 3, handY - 24,
        handX + 3, handY,
        handX - 1, handY,
      ]).fill({ color: 0xc0c0c0 });
      // Blade highlight (centre fuller)
      g.rect(handX, handY - 22, 1, 20).fill({ color: 0xffffff, alpha: 0.45 });
      // Crossguard
      g.rect(handX - 4, handY, 10, 2).fill({ color: 0xb09028 });
      // Grip
      g.rect(handX - 1, handY + 2, 4, 6).fill({ color: 0x3a1a08 });
      // Pommel
      g.circle(handX + 1, handY + 9, 1.8).fill({ color: 0xb09028 });
      break;
    }
    default:
      break;
  }
}

function mobNameForMaxHp(maxHp: number): string {
  if (maxHp >= 100) return "Bog Horror";
  if (maxHp >= 60) return "Dwarf Thug";
  if (maxHp >= 30) return "Bandit";
  if (maxHp >= 15) return "Goblin";
  return "Marsh Rat";
}

// ── Mob art ───────────────────────────────────────────────────────────────

function drawMarshRat(g: Graphics, cx: number, feetY: number): void {
  const baseY = feetY - 6;
  // Body — stretched horizontal ellipse (rats are low to the ground)
  g.ellipse(cx, baseY, 12, 6).fill({ color: 0x6a4a30 });
  g.ellipse(cx + 1, baseY + 1, 12, 6).fill({ color: 0x4a2e18, alpha: 0.5 });
  // Head
  g.ellipse(cx + 8, baseY - 2, 5, 4).fill({ color: 0x6a4a30 });
  // Snout
  g.circle(cx + 12, baseY - 1, 1.5).fill({ color: 0xe05050 });
  // Eye
  g.circle(cx + 9, baseY - 3, 0.8).fill({ color: 0x100404 });
  // Tail — curved line via thin polys
  g.rect(cx - 12, baseY, 8, 1).fill({ color: 0x4a2e18 });
  // Ears
  g.circle(cx + 6, baseY - 5, 1.5).fill({ color: 0x4a2e18 });
}

function drawGoblin(g: Graphics, cx: number, feetY: number): void {
  const baseY = feetY - 14;
  // Body — green hunched figure
  g.poly([
    cx - 8, baseY,
    cx + 8, baseY,
    cx + 11, feetY,
    cx - 11, feetY,
  ]).fill({ color: 0x4a7a30 });
  g.poly([
    cx + 1, baseY,
    cx + 8, baseY,
    cx + 11, feetY,
    cx + 4, feetY,
  ]).fill({ color: 0x2a5a18 });
  // Head — pointy
  g.ellipse(cx, baseY - 6, 8, 8).fill({ color: 0x6aa040 });
  // Pointy ears
  g.poly([cx - 7, baseY - 8, cx - 11, baseY - 12, cx - 6, baseY - 5]).fill({ color: 0x6aa040 });
  g.poly([cx + 7, baseY - 8, cx + 11, baseY - 12, cx + 6, baseY - 5]).fill({ color: 0x4a7a30 });
  // Yellow eyes (glowing)
  g.circle(cx - 3, baseY - 6, 1.4).fill({ color: 0xffe040 });
  g.circle(cx + 3, baseY - 6, 1.4).fill({ color: 0xffe040 });
  // Crude mouth/teeth
  g.rect(cx - 2, baseY - 2, 4, 1.5).fill({ color: 0x2a1810 });
}

function drawBandit(g: Graphics, cx: number, feetY: number): void {
  const baseY = feetY - 18;
  // Body — hooded purple silhouette
  g.poly([
    cx - 10, baseY,
    cx + 10, baseY,
    cx + 13, feetY,
    cx - 13, feetY,
  ]).fill({ color: 0x6a3060 });
  g.poly([
    cx + 1, baseY,
    cx + 10, baseY,
    cx + 13, feetY,
    cx + 4, feetY,
  ]).fill({ color: 0x401838 });
  // Belt
  g.rect(cx - 11, feetY - 8, 22, 2).fill({ color: 0x2a0a18 });
  // Hood (overhanging head)
  g.ellipse(cx, baseY - 4, 10, 9).fill({ color: 0x401838 });
  // Face shadow under hood
  g.ellipse(cx, baseY - 2, 7, 5).fill({ color: 0x100008 });
  // Glowing red eyes
  g.circle(cx - 2, baseY - 2, 0.9).fill({ color: 0xff4040 });
  g.circle(cx + 2, baseY - 2, 0.9).fill({ color: 0xff4040 });
}

function drawDwarfThug(g: Graphics, cx: number, feetY: number): void {
  const baseY = feetY - 22;
  // Body — stocky grey
  g.poly([
    cx - 13, baseY,
    cx + 13, baseY,
    cx + 14, feetY,
    cx - 14, feetY,
  ]).fill({ color: 0x6a6a78 });
  g.poly([
    cx + 1, baseY,
    cx + 13, baseY,
    cx + 14, feetY,
    cx + 4, feetY,
  ]).fill({ color: 0x40404a });
  // Belt
  g.rect(cx - 14, feetY - 10, 28, 3).fill({ color: 0x2a2a30 });
  // Big square head
  g.roundRect(cx - 9, baseY - 14, 18, 14, 3).fill({ color: 0xd0a070 });
  g.roundRect(cx, baseY - 14, 9, 14, 3).fill({ color: 0x8a6a40 });
  // Helmet
  g.poly([
    cx - 10, baseY - 14,
    cx + 10, baseY - 14,
    cx + 8, baseY - 19,
    cx - 8, baseY - 19,
  ]).fill({ color: 0x707080 });
  // Beard
  g.poly([
    cx - 7, baseY - 4,
    cx + 7, baseY - 4,
    cx + 4, baseY + 4,
    cx - 4, baseY + 4,
  ]).fill({ color: 0xc04020 });
  // Eyes
  g.circle(cx - 3, baseY - 8, 0.9).fill({ color: 0x100808 });
  g.circle(cx + 3, baseY - 8, 0.9).fill({ color: 0x100808 });
}

function drawBogHorror(g: Graphics, cx: number, feetY: number): void {
  const baseY = feetY - 8;
  // Amorphous dark blob — three overlapping ellipses for an unsettled outline.
  g.ellipse(cx, baseY, 22, 14).fill({ color: 0x1a0820 });
  g.ellipse(cx - 8, baseY - 4, 14, 10).fill({ color: 0x2a1030 });
  g.ellipse(cx + 9, baseY - 6, 12, 9).fill({ color: 0x2a1030 });
  // "Tentacles" rising from the body
  for (let i = 0; i < 5; i++) {
    const tx = cx - 16 + i * 8;
    const ty = baseY - 18 - (i % 2) * 4;
    g.ellipse(tx, ty, 3, 8).fill({ color: 0x40184a });
    g.circle(tx, ty - 6, 2).fill({ color: 0xff40ff, alpha: 0.85 });
  }
  // Many glowing eyes
  for (let i = 0; i < 6; i++) {
    const ex = cx - 12 + Math.floor(i / 2) * 12 + (i % 2) * 4;
    const ey = baseY - 2 - (i % 2) * 4;
    g.circle(ex, ey, 1.2).fill({ color: 0xff80ff });
  }
}
