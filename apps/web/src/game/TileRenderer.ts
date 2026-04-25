import { Graphics, Container } from "pixi.js";
import { TILE_W, TILE_H, HALF_W, HALF_H, GRID_W, GRID_H, tileToIso } from "./projection";
import { activeTheme } from "./Theme";

// Re-exports so existing call sites keep compiling. New code should import
// from ./projection directly.
export const TILE_SIZE = TILE_W;
export { GRID_W, GRID_H };

export class TileRenderer {
  readonly container: Container;
  private g: Graphics;

  constructor() {
    this.container = new Container();
    this.g = new Graphics();
    this.container.addChild(this.g);
    this.build();
  }

  /** Re-render after a theme change. */
  rebuild(): void {
    this.build();
  }

  private build(): void {
    const theme = activeTheme();
    const g = this.g;
    g.clear();

    // Deterministic per-tile pseudo-random so themes recolour the same
    // pattern. Hash from (col, row).
    const rand = (col: number, row: number, salt: number): number => {
      const h = Math.sin(col * 374.0 + row * 153.7 + salt * 12.3) * 43758.5453;
      return h - Math.floor(h);
    };
    // Slight per-tile shade jitter on top of the A/B checkerboard so the
    // ground reads as natural turf instead of a chess board.
    const shadeMix = (a: number, b: number, t: number): number => {
      const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
      const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
      const r = Math.round(ar + (br - ar) * t);
      const gg = Math.round(ag + (bg - ag) * t);
      const bbn = Math.round(ab + (bb - ab) * t);
      return (r << 16) | (gg << 8) | bbn;
    };

    for (let row = 0; row < GRID_H; row++) {
      for (let col = 0; col < GRID_W; col++) {
        const c = tileToIso(col, row);
        const baseA = (col + row) % 2 === 0 ? theme.tileFillA : theme.tileFillB;
        const jitterT = rand(col, row, 1) * 0.25;
        const fill = shadeMix(baseA, theme.tileFillB, jitterT);
        g.poly([
          c.x, c.y - HALF_H,
          c.x + HALF_W, c.y,
          c.x, c.y + HALF_H,
          c.x - HALF_W, c.y,
        ]).fill({ color: fill });

        // Three speckle dots per tile for "grass / pebble" texture. Use the
        // theme edge colour at very low alpha — picks up the active theme.
        for (let i = 0; i < 3; i++) {
          const sx = rand(col, row, 7 + i) - 0.5;
          const sy = rand(col, row, 13 + i) - 0.5;
          const r = 0.7 + rand(col, row, 19 + i) * 0.7;
          // Restrict to interior of diamond so speckles never poke past edges.
          const px = c.x + sx * (HALF_W - 6);
          const py = c.y + sy * (HALF_H - 4);
          g.circle(px, py, r).fill({ color: theme.tileEdge, alpha: 0.18 });
        }
      }
    }

    // Soft outline around the playable area so the world has visible edges.
    const corners = [
      tileToIso(0, 0),
      tileToIso(GRID_W - 1, 0),
      tileToIso(GRID_W - 1, GRID_H - 1),
      tileToIso(0, GRID_H - 1),
    ];
    g.poly([
      corners[0].x, corners[0].y - HALF_H,
      corners[1].x + HALF_W, corners[1].y,
      corners[2].x, corners[2].y + HALF_H,
      corners[3].x - HALF_W, corners[3].y,
    ]).stroke({ color: theme.tileEdge, width: 2, alpha: 0.6 });
  }
}

export const ISO = { TILE_W, TILE_H, HALF_W, HALF_H };
