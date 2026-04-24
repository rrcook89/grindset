import { Graphics, Container } from "pixi.js";
import type { Player } from "../net/types";
import { TILE_SIZE } from "./TileRenderer";

// Sprite bounding box per art-pipeline spec: 64×96px
const SPRITE_W = 64;
const SPRITE_H = 96;
const RADIUS = 20;

const COLOR_SELF = 0xf5c14b; // bright ingot gold
const COLOR_OTHER = 0xa07820; // muted gold

export class EntityRenderer {
  readonly container: Container;
  private sprites = new Map<number, Graphics>();

  constructor() {
    this.container = new Container();
  }

  updatePlayers(localPlayer: Player | null, others: Map<number, Player>): void {
    const seen = new Set<number>();

    if (localPlayer) {
      seen.add(localPlayer.id);
      this.upsert(localPlayer.id, localPlayer.x, localPlayer.y, true);
    }

    for (const [id, player] of others) {
      seen.add(id);
      this.upsert(id, player.x, player.y, false);
    }

    // Remove sprites for entities no longer present
    for (const [id, sprite] of this.sprites) {
      if (!seen.has(id)) {
        this.container.removeChild(sprite);
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private upsert(id: number, tileX: number, tileY: number, isSelf: boolean): void {
    let g = this.sprites.get(id);

    if (!g) {
      g = new Graphics();
      this.sprites.set(id, g);
      this.container.addChild(g);
    }

    g.clear();
    const color = isSelf ? COLOR_SELF : COLOR_OTHER;
    // Center circle within the 64×96 bounding box
    g.circle(SPRITE_W / 2, SPRITE_H / 2, RADIUS).fill({ color });
    if (isSelf) {
      // Subtle outline so self is distinct at a glance
      g.circle(SPRITE_W / 2, SPRITE_H / 2, RADIUS).stroke({ color: 0xffffff, width: 2 });
    }

    // Position: top-left of bounding box, centered on the tile
    g.x = tileX * TILE_SIZE + (TILE_SIZE - SPRITE_W) / 2;
    g.y = tileY * TILE_SIZE + (TILE_SIZE - SPRITE_H) / 2;
  }
}
