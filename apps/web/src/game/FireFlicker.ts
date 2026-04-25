import { Container, Graphics } from "pixi.js";
import { tileToIso, tileDepth } from "./projection";
import type { NodeEntity } from "./NodeRenderer";

interface FireEntry {
  g: Graphics;
  /** "firepit" | "furnace" — different flame layouts */
  kind: "firepit" | "furnace";
  /** Phase offset 0..1 so multiple fires don't pulse in lockstep. */
  phase: number;
}

/**
 * Per-frame flame layer that overlays firepit + furnace nodes. Drawn on
 * its own container so we redraw every frame without re-rendering the
 * static stone bases. Colour is the same red→orange→yellow gradient as
 * the static art; what changes is the height + a sin-wobble so the fire
 * feels alive.
 */
export class FireFlicker {
  readonly container: Container;
  private fires = new Map<number, FireEntry>();

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;
  }

  syncFires(nodes: Map<number, NodeEntity>): void {
    const seen = new Set<number>();
    for (const [id, n] of nodes) {
      if (n.kind !== "firepit" && n.kind !== "furnace") continue;
      seen.add(id);
      let entry = this.fires.get(id);
      if (!entry) {
        const g = new Graphics();
        const c = tileToIso(n.x, n.y);
        g.x = c.x;
        // Match NodeRenderer's anchor (tile centre + HALF_H * 0.5).
        g.y = c.y + 12;
        g.zIndex = tileDepth(n.x, n.y) * 10 + 1;
        this.container.addChild(g);
        entry = { g, kind: n.kind as "firepit" | "furnace", phase: Math.random() };
        this.fires.set(id, entry);
      }
    }
    for (const [id, entry] of this.fires) {
      if (!seen.has(id)) {
        this.container.removeChild(entry.g);
        entry.g.destroy();
        this.fires.delete(id);
      }
    }
  }

  tick(): void {
    const t = performance.now() / 1000;
    for (const entry of this.fires.values()) {
      const phaseT = (t * 4 + entry.phase * 6.28) % (Math.PI * 2);
      // Two stacked sin waves give a less-regular flicker.
      const wob = Math.sin(phaseT) * 0.5 + Math.sin(phaseT * 2.7) * 0.25;
      const heightMul = 1 + wob * 0.18;
      const swayX = Math.sin(phaseT * 1.3) * 1.2;

      entry.g.clear();
      if (entry.kind === "firepit") {
        this.drawFirepitFlames(entry.g, heightMul, swayX);
      } else {
        this.drawFurnaceFlames(entry.g, heightMul, swayX);
      }
    }
  }

  private drawFirepitFlames(g: Graphics, h: number, sx: number): void {
    // Outer flame
    g.poly([
      sx, -14 * h,
      6, -4,
      sx, 0,
      -6, -4,
    ]).fill({ color: 0xff4020 });
    // Mid flame
    g.poly([
      sx * 0.8, -10 * h,
      4, -4,
      sx * 0.8, -2,
      -4, -4,
    ]).fill({ color: 0xff8030 });
    // Hot core
    g.poly([
      sx * 0.5, -8 * h,
      2, -4,
      sx * 0.5, -4,
      -2, -4,
    ]).fill({ color: 0xffd060 });
    // Floating sparks above
    g.circle(sx + 3, -14 * h - 2, 0.8).fill({ color: 0xffe060, alpha: 0.85 });
    g.circle(sx - 4, -16 * h, 0.6).fill({ color: 0xffe060, alpha: 0.6 });
  }

  private drawFurnaceFlames(g: Graphics, h: number, sx: number): void {
    // Furnace flames sit inside the hearth opening at roughly y = +7 in
    // node-local space. Translate so the FireFlicker entry's anchor matches.
    const baseY = 8;
    // Single ember mass with a wobbling top.
    g.poly([
      sx * 0.6, baseY - 8 * h,
      4, baseY - 1,
      sx * 0.4, baseY,
      -4, baseY - 1,
    ]).fill({ color: 0xffe060, alpha: 0.85 });
    // Inner brighter pip
    g.circle(sx * 0.3, baseY - 4 * h, 1.6).fill({ color: 0xfff8c0, alpha: 0.95 });
  }
}
