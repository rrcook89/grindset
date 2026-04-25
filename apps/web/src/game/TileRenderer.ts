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

    // Two-toned checkerboard for depth perception. Slightly varying shade
    // makes the diamond grid readable without leaning on grid lines.
    for (let row = 0; row < GRID_H; row++) {
      for (let col = 0; col < GRID_W; col++) {
        const c = tileToIso(col, row);
        const fill = (col + row) % 2 === 0 ? theme.tileFillA : theme.tileFillB;
        g.poly([
          c.x, c.y - HALF_H,
          c.x + HALF_W, c.y,
          c.x, c.y + HALF_H,
          c.x - HALF_W, c.y,
        ]).fill({ color: fill });
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
