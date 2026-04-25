import { Container, Graphics } from "pixi.js";
import { tileToIso, tileDepth, HALF_W, HALF_H } from "./projection";
import type { NodeEntity } from "./NodeRenderer";

const RIPPLE_PERIOD_MS = 2200;
const SPOT_COLORS: Record<string, number> = {
  spot_shrimp: 0x5ac8f5,
  spot_trout: 0x80b8c8,
  spot_lobster: 0xf08080,
  spot_swordfish: 0x80a0d0,
};

interface SpotEntry {
  g: Graphics;
  col: number;
  row: number;
  defId: string;
  /** Phase offset 0..1 so spots don't pulse in unison. */
  phase: number;
}

/**
 * Per-frame expanding-diamond ripples on fishing spots. Each spot has its
 * own randomised phase so a cluster of spots breathes naturally.
 */
export class WaterRipples {
  readonly container: Container;
  private spots = new Map<number, SpotEntry>();

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;
  }

  syncSpots(nodes: Map<number, NodeEntity>): void {
    const seen = new Set<number>();
    for (const [id, n] of nodes) {
      if (n.kind !== "spot") continue;
      seen.add(id);
      let entry = this.spots.get(id);
      if (!entry) {
        const g = new Graphics();
        g.x = tileToIso(n.x, n.y).x;
        g.y = tileToIso(n.x, n.y).y;
        g.zIndex = tileDepth(n.x, n.y) * 10 - 1;
        this.container.addChild(g);
        entry = { g, col: n.x, row: n.y, defId: n.defId ?? "spot_shrimp", phase: Math.random() };
        this.spots.set(id, entry);
      }
    }
    for (const [id, entry] of this.spots) {
      if (!seen.has(id)) {
        this.container.removeChild(entry.g);
        entry.g.destroy();
        this.spots.delete(id);
      }
    }
  }

  tick(): void {
    const t = (performance.now() % RIPPLE_PERIOD_MS) / RIPPLE_PERIOD_MS;
    for (const entry of this.spots.values()) {
      const color = SPOT_COLORS[entry.defId] ?? SPOT_COLORS.spot_shrimp;
      entry.g.clear();
      // Two ripples at offset phases for a continuous "breathing" feel.
      for (let i = 0; i < 2; i++) {
        const phaseT = (t + entry.phase + i * 0.5) % 1;
        const scale = 0.4 + phaseT * 0.9;
        const alpha = (1 - phaseT) * 0.65;
        const rx = (HALF_W - 4) * scale;
        const ry = (HALF_H - 2) * scale;
        entry.g.poly([
          0, -ry,
          rx, 0,
          0, ry,
          -rx, 0,
        ]).stroke({ color, width: 1.5, alpha });
      }
    }
  }
}
