import { Graphics, Container } from "pixi.js";

export const TILE_SIZE = 64; // 32px art × 2× scale
export const GRID_W = 50;
export const GRID_H = 50;

const TILE_FILL = 0x1a2332; // dark blue-grey ground
const TILE_BORDER = 0xf5c14b; // ingot gold grid lines

export class TileRenderer {
  readonly container: Container;

  constructor() {
    this.container = new Container();
    this.build();
  }

  private build(): void {
    const g = new Graphics();

    for (let row = 0; row < GRID_H; row++) {
      for (let col = 0; col < GRID_W; col++) {
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        g.rect(x, y, TILE_SIZE, TILE_SIZE).fill({ color: TILE_FILL });
        g.rect(x, y, TILE_SIZE, TILE_SIZE).stroke({ color: TILE_BORDER, width: 1 });
      }
    }

    this.container.addChild(g);
  }
}
