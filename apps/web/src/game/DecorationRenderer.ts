import { Container, Graphics } from "pixi.js";
import { tileToIso, tileDepth, GRID_W, GRID_H } from "./projection";
import { activeTheme } from "./Theme";

/**
 * Decorative non-interactive props — bushes, mushrooms, grass tufts —
 * scattered deterministically across empty tiles. They re-pick colours
 * on theme change so the world's vegetation matches the active palette.
 *
 * Caller should pass the set of tiles already occupied by mobs, nodes, and
 * the bank so we don't draw a bush on top of a rock.
 */

interface DecoEntry {
  g: Graphics;
  col: number;
  row: number;
  kind: number; // hash determines which prop to draw
}

// Deterministic hash → [0, 1).
function hash01(col: number, row: number, salt: number): number {
  const h = Math.sin(col * 421.31 + row * 167.97 + salt * 33.7) * 43758.5453;
  return h - Math.floor(h);
}

export class DecorationRenderer {
  readonly container: Container;
  private entries: DecoEntry[] = [];

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;
  }

  /** (Re)build the decoration set. `occupied` is "col,row" strings. */
  build(occupied: Set<string>): void {
    for (const e of this.entries) {
      this.container.removeChild(e.g);
      e.g.destroy();
    }
    this.entries = [];

    const theme = activeTheme();

    for (let row = 0; row < GRID_H; row++) {
      for (let col = 0; col < GRID_W; col++) {
        if (occupied.has(`${col},${row}`)) continue;
        // Spawn rate ~12% — sparse enough to not clutter the path.
        if (hash01(col, row, 1) > 0.12) continue;

        const c = tileToIso(col, row);
        const g = new Graphics();
        const kind = Math.floor(hash01(col, row, 2) * 4); // 0..3
        const jx = (hash01(col, row, 3) - 0.5) * 18;
        const jy = (hash01(col, row, 4) - 0.5) * 8;

        switch (kind) {
          case 0: // grass tuft — three thin blades
            g.poly([0, 0, -2, -7, 0, -2]).fill({ color: theme.treeCanopy });
            g.poly([0, 0, 0, -10, 2, -2]).fill({ color: theme.treeCanopy });
            g.poly([0, 0, 3, -7, 1, -2]).fill({ color: theme.spotGlow });
            break;
          case 1: // small bush
            g.ellipse(0, 0, 7, 5).fill({ color: theme.treeCanopy });
            g.ellipse(-2, -2, 4, 3).fill({ color: theme.spotGlow, alpha: 0.7 });
            g.ellipse(2, 1, 3, 2).fill({ color: 0x000000, alpha: 0.25 });
            break;
          case 2: // mushroom
            g.rect(-1, -2, 2, 5).fill({ color: 0xe0d0a0 });
            g.ellipse(0, -3, 5, 3).fill({ color: theme.tileEdge });
            g.circle(-1.5, -3.5, 0.7).fill({ color: 0xfff8dc });
            g.circle(1.5, -3, 0.6).fill({ color: 0xfff8dc });
            break;
          case 3: // pebble cluster
            g.circle(0, 0, 2.5).fill({ color: theme.rockBody });
            g.circle(3, 1, 1.7).fill({ color: theme.rockShadow });
            g.circle(-2, 1, 1.4).fill({ color: theme.rockBody });
            break;
        }

        g.x = c.x + jx;
        g.y = c.y + jy;
        g.zIndex = tileDepth(col, row) * 10 - 2;

        this.entries.push({ g, col, row, kind });
        this.container.addChild(g);
      }
    }
  }
}
