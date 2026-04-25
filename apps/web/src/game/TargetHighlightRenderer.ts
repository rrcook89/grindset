import { Container, Graphics } from "pixi.js";
import { tileToIso, HALF_W, HALF_H } from "./projection";

export interface HighlightTarget {
  tileX: number;
  tileY: number;
  /** "combat" = red ring, "skill" = gold ring */
  kind: "combat" | "skill";
}

const COLOR_COMBAT = 0xe04545; // loss-red
const COLOR_SKILL  = 0xf5c14b; // ingot-gold

export class TargetHighlightRenderer {
  readonly container: Container;
  private g: Graphics;

  constructor() {
    this.container = new Container();
    this.g = new Graphics();
    this.container.addChild(this.g);
  }

  /** Draw a pulsing ring under each active target. Call every frame. */
  tick(targets: HighlightTarget[]): void {
    this.g.clear();
    if (targets.length === 0) return;

    // Pulse: 1.5s cycle, scale 1.0 → 1.15 → 1.0
    const t = (performance.now() % 1500) / 1500; // 0..1
    const pulse = 0.5 - 0.5 * Math.cos(t * Math.PI * 2); // 0..1
    const scale = 1.0 + pulse * 0.15;
    const alpha = 0.5 + pulse * 0.4;

    for (const tgt of targets) {
      const c = tileToIso(tgt.tileX, tgt.tileY);
      const rx = (HALF_W - 4) * scale;
      const ry = (HALF_H - 2) * scale;
      const color = tgt.kind === "combat" ? COLOR_COMBAT : COLOR_SKILL;

      // Diamond-shaped pulsing ring — matches the iso tile footprint.
      this.g.poly([
        c.x, c.y - ry,
        c.x + rx, c.y,
        c.x, c.y + ry,
        c.x - rx, c.y,
      ]).stroke({ color, width: 3, alpha });
    }
  }
}
