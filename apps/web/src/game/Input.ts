import type { FederatedPointerEvent } from "pixi.js";
import type { Container } from "pixi.js";
import { encodeMoveIntent } from "../net/protocol";
import type { GameSocket } from "../net/Socket";
import { TILE_SIZE } from "./TileRenderer";

export class Input {
  constructor(
    private readonly worldContainer: Container,
    private readonly socket: GameSocket,
  ) {
    this.worldContainer.eventMode = "static";
    this.worldContainer.on("pointerdown", this.onPointerDown);
  }

  private onPointerDown = (e: FederatedPointerEvent): void => {
    const local = e.getLocalPosition(this.worldContainer);
    const tileX = Math.floor(local.x / TILE_SIZE);
    const tileY = Math.floor(local.y / TILE_SIZE);

    if (tileX < 0 || tileY < 0) return;

    this.socket.sendRaw(encodeMoveIntent(tileX, tileY));
  };

  destroy(): void {
    this.worldContainer.off("pointerdown", this.onPointerDown);
  }
}
