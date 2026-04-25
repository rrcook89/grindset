import { Application, Container } from "pixi.js";
import { TileRenderer, TILE_SIZE, GRID_W, GRID_H } from "./TileRenderer";
import { EntityRenderer } from "./EntityRenderer";
import { NodeRenderer } from "./NodeRenderer";
import { FloatingTextRenderer } from "./FloatingTextRenderer";
import { TargetHighlightRenderer, type HighlightTarget } from "./TargetHighlightRenderer";
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
  private floatRenderer: FloatingTextRenderer;
  private highlightRenderer: TargetHighlightRenderer;
  private input: Input;
  private unsubscribe: () => void;

  private constructor(
    app: Application,
    worldContainer: Container,
    tileRenderer: TileRenderer,
    entityRenderer: EntityRenderer,
    nodeRenderer: NodeRenderer,
    floatRenderer: FloatingTextRenderer,
    highlightRenderer: TargetHighlightRenderer,
    input: Input,
    unsubscribe: () => void,
  ) {
    this.app = app;
    this.worldContainer = worldContainer;
    this.tileRenderer = tileRenderer;
    this.entityRenderer = entityRenderer;
    this.nodeRenderer = nodeRenderer;
    this.floatRenderer = floatRenderer;
    this.highlightRenderer = highlightRenderer;
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

    // Target highlight ring sits between tiles and nodes/entities so it
    // appears under the feet of mobs and around skill nodes.
    const highlightRenderer = new TargetHighlightRenderer();
    worldContainer.addChild(highlightRenderer.container);

    // Nodes sit between tiles and entities
    const nodeRenderer = new NodeRenderer();
    worldContainer.addChild(nodeRenderer.container);

    const entityRenderer = new EntityRenderer();
    worldContainer.addChild(entityRenderer.container);

    // Floating text sits above entities so XP/gold pops over the player.
    const floatRenderer = new FloatingTextRenderer();
    worldContainer.addChild(floatRenderer.container);

    const input = new Input(worldContainer, socket, app.ticker);

    // Subscribe to store changes → update renderers each frame
    let needsRender = true;
    const unsubscribe = useGameStore.subscribe(() => {
      needsRender = true;
    });

    let lastFloatSweep = 0;
    let lastSwingBorn = 0;
    app.ticker.add((ticker) => {
      const deltaMs = ticker.deltaMS;

      // Trigger swing animation if a fresh swing event landed.
      const swingState = useGameStore.getState();
      const sw = swingState.lastSwing;
      if (sw && sw.born !== lastSwingBorn) {
        lastSwingBorn = sw.born;
        // Resolve attacker + target tiles. Either side may be local player or mob.
        const lp = swingState.localPlayer;
        const attTile =
          lp && lp.id === sw.attackerId
            ? { x: lp.x, y: lp.y }
            : swingState.mobs.get(sw.attackerId);
        const tgtTile =
          lp && lp.id === sw.targetId
            ? { x: lp.x, y: lp.y }
            : swingState.mobs.get(sw.targetId);
        if (attTile && tgtTile) {
          entityRenderer.setSwing(sw.attackerId, attTile.x, attTile.y, tgtTile.x, tgtTile.y);
        }
      }

      // Always tick animation (independent of store changes)
      entityRenderer.tick(deltaMs);
      floatRenderer.tick();

      // Target highlight rings — recompute every frame so they pulse
      // and follow moving mobs.
      const hi = useGameStore.getState();
      const highlights: HighlightTarget[] = [];
      const ct = hi.combatTarget;
      if (ct) {
        const m = hi.mobs.get(ct.entityId);
        if (m) highlights.push({ tileX: m.x, tileY: m.y, kind: "combat" });
      }
      if (hi.skillTargetId !== null) {
        const n = hi.nodes.get(hi.skillTargetId);
        if (n) highlights.push({ tileX: n.x, tileY: n.y, kind: "skill" });
      }
      highlightRenderer.tick(highlights);

      // Sweep expired floats off the store ~4×/sec.
      const now = performance.now();
      if (now - lastFloatSweep > 250) {
        useGameStore.getState().clearExpiredFloats();
        lastFloatSweep = now;
      }

      // Bank proximity: open BankModal automatically when player is adjacent
      // to a bank node, close when they wander off.
      {
        const s = useGameStore.getState();
        if (s.localPlayer) {
          const lp = s.localPlayer;
          let adjacentToBank = false;
          for (const n of s.nodes.values()) {
            if (n.kind !== "bank") continue;
            if (Math.max(Math.abs(n.x - lp.x), Math.abs(n.y - lp.y)) <= 1) {
              adjacentToBank = true;
              break;
            }
          }
          if (adjacentToBank && !s.bankOpen) {
            s.setBankOpen(true);
            // Welcome quest: tick "Visit the bank" once.
            s.incQuestObjective("welcome_to_mireholm", 2, 1);
          } else if (!adjacentToBank && s.bankOpen) s.setBankOpen(false);
        }
      }

      if (!needsRender) return;
      needsRender = false;

      const { localPlayer, otherPlayers, nodes, mobs, floats } = useGameStore.getState();
      const names = new Map<number, string>();
      if (localPlayer?.name) names.set(localPlayer.id, localPlayer.name);
      for (const [pid, p] of otherPlayers) {
        if (p.name) names.set(pid, p.name);
      }
      entityRenderer.updatePlayers(localPlayer, otherPlayers, names);
      entityRenderer.updateMobs(mobs);
      nodeRenderer.updateNodes(nodes);
      floatRenderer.update(floats);

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

    return new Game(
      app,
      worldContainer,
      tileRenderer,
      entityRenderer,
      nodeRenderer,
      floatRenderer,
      highlightRenderer,
      input,
      unsubscribe,
    );
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
    this.worldContainer.removeChild(this.highlightRenderer.container);
    this.worldContainer.removeChild(this.nodeRenderer.container);
    this.worldContainer.removeChild(this.entityRenderer.container);
    this.worldContainer.removeChild(this.floatRenderer.container);
    this.app.destroy(false);
  }
}
