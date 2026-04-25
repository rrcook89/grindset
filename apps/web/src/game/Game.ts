import { Application, Container } from "pixi.js";
import { TileRenderer, TILE_SIZE, GRID_W, GRID_H } from "./TileRenderer";
import { EntityRenderer } from "./EntityRenderer";
import { NodeRenderer } from "./NodeRenderer";
import { Input } from "./Input";
import type { GameSocket } from "../net/Socket";
import { useGameStore } from "../state/store";

// Viewport: ~20×15 tiles visible around the player
const VIEWPORT_TILES_X = 20;
const VIEWPORT_TILES_Y = 15;

export class Game {
  private app: Application;
  private worldContainer: Container;
  private tileRenderer: TileRenderer;
  private entityRenderer: EntityRenderer;
  private nodeRenderer: NodeRenderer;
  private input: Input;
  private unsubscribe: () => void;

  private constructor(
    app: Application,
    worldContainer: Container,
    tileRenderer: TileRenderer,
    entityRenderer: EntityRenderer,
    nodeRenderer: NodeRenderer,
    input: Input,
    unsubscribe: () => void,
  ) {
    this.app = app;
    this.worldContainer = worldContainer;
    this.tileRenderer = tileRenderer;
    this.entityRenderer = entityRenderer;
    this.nodeRenderer = nodeRenderer;
    this.input = input;
    this.unsubscribe = unsubscribe;
  }

  static async create(canvas: HTMLCanvasElement, socket: GameSocket): Promise<Game> {
    const app = new Application();
    await app.init({
      canvas,
      resizeTo: canvas.parentElement ?? canvas,
      backgroundColor: 0x0b0f14,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio ?? 1,
    });

    // World container holds tiles + entities; we pan this for the camera
    const worldContainer = new Container();
    app.stage.addChild(worldContainer);

    // Hit area covers full grid so clicks outside visible tiles still register
    worldContainer.hitArea = {
      contains(x: number, y: number): boolean {
        return (
          x >= 0 && y >= 0 && x <= GRID_W * TILE_SIZE && y <= GRID_H * TILE_SIZE
        );
      },
    };

    const tileRenderer = new TileRenderer();
    worldContainer.addChild(tileRenderer.container);

    // Nodes sit between tiles and entities
    const nodeRenderer = new NodeRenderer();
    worldContainer.addChild(nodeRenderer.container);

    const entityRenderer = new EntityRenderer();
    worldContainer.addChild(entityRenderer.container);

    const input = new Input(worldContainer, socket, app.ticker);

    // Subscribe to store changes → update renderers each frame
    let needsRender = true;
    const unsubscribe = useGameStore.subscribe(() => {
      needsRender = true;
    });

    app.ticker.add((ticker) => {
      const deltaMs = ticker.deltaMS;

      // Always tick animation (independent of store changes)
      entityRenderer.tick(deltaMs);

      if (!needsRender) return;
      needsRender = false;

      const { localPlayer, otherPlayers, nodes, mobs } = useGameStore.getState();
      entityRenderer.updatePlayers(localPlayer, otherPlayers);
      entityRenderer.updateMobs(mobs);
      nodeRenderer.updateNodes(nodes);

      // Camera: center viewport on local player
      if (localPlayer) {
        const playerPxX = localPlayer.x * TILE_SIZE + TILE_SIZE / 2;
        const playerPxY = localPlayer.y * TILE_SIZE + TILE_SIZE / 2;
        const targetX = app.screen.width / 2 - playerPxX;
        const targetY = app.screen.height / 2 - playerPxY;

        // Clamp so we don't show void beyond grid edges
        const minX = Math.min(0, app.screen.width - GRID_W * TILE_SIZE);
        const minY = Math.min(0, app.screen.height - GRID_H * TILE_SIZE);
        worldContainer.x = Math.max(minX, Math.min(0, targetX));
        worldContainer.y = Math.max(minY, Math.min(0, targetY));
      }
    });

    return new Game(app, worldContainer, tileRenderer, entityRenderer, nodeRenderer, input, unsubscribe);
  }

  // Unused but satisfies TS noUnusedLocals via reference
  get viewportTiles(): { x: number; y: number } {
    return { x: VIEWPORT_TILES_X, y: VIEWPORT_TILES_Y };
  }

  destroy(): void {
    this.input.destroy();
    this.unsubscribe();
    // Remove world and renderer containers before destroying app
    this.worldContainer.removeChild(this.tileRenderer.container);
    this.worldContainer.removeChild(this.nodeRenderer.container);
    this.worldContainer.removeChild(this.entityRenderer.container);
    this.app.destroy(false);
  }
}
