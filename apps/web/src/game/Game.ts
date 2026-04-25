import { Application, Container } from "pixi.js";
import { TileRenderer } from "./TileRenderer";
import { tileToIso, GRID_W, GRID_H, HALF_W, HALF_H } from "./projection";
import { activeTheme, onThemeChange } from "./Theme";
import { EntityRenderer } from "./EntityRenderer";
import { NodeRenderer } from "./NodeRenderer";
import { FloatingTextRenderer } from "./FloatingTextRenderer";
import { TargetHighlightRenderer, type HighlightTarget } from "./TargetHighlightRenderer";
import { AmbientParticles } from "./AmbientParticles";
import { DecorationRenderer } from "./DecorationRenderer";
import { Input } from "./Input";
import type { GameSocket } from "../net/Socket";
import { useGameStore } from "../state/store";
import { sfx } from "./Sfx";

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
      backgroundColor: activeTheme().background,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio ?? 1,
    });

    // World container holds tiles + entities; we pan this for the camera
    const worldContainer = new Container();
    app.stage.addChild(worldContainer);

    // Hit area covers the iso world's bounding box. Since col=0..GRID_W-1
    // and row=0..GRID_H-1, screen-x ranges from -(GRID_H-1)*HALF_W to
    // +(GRID_W-1)*HALF_W and screen-y from 0 to (GRID_W+GRID_H-2)*HALF_H.
    const xMin = -(GRID_H - 1) * HALF_W - HALF_W;
    const xMax = (GRID_W - 1) * HALF_W + HALF_W;
    const yMax = (GRID_W + GRID_H - 2) * HALF_H + HALF_H;
    worldContainer.hitArea = {
      contains(x: number, y: number): boolean {
        return x >= xMin && x <= xMax && y >= -HALF_H && y <= yMax;
      },
    };

    const tileRenderer = new TileRenderer();
    worldContainer.addChild(tileRenderer.container);

    // Decorations live just above the tiles. We rebuild them once we see
    // which tiles are occupied by nodes (after first render).
    const decoRenderer = new DecorationRenderer();
    worldContainer.addChild(decoRenderer.container);
    let decoBuilt = false;
    const buildDecorations = () => {
      const { nodes, mobs } = useGameStore.getState();
      const occupied = new Set<string>();
      for (const n of nodes.values()) occupied.add(`${n.x},${n.y}`);
      for (const m of mobs.values()) occupied.add(`${m.x},${m.y}`);
      decoRenderer.build(occupied);
    };

    // Re-render tiles + repaint canvas background when the theme changes.
    const offTheme = onThemeChange(() => {
      tileRenderer.rebuild();
      app.renderer.background.color = activeTheme().background;
      buildDecorations();
    });

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

    // Ambient drifting fireflies — pure cosmetic, sits above tiles, below
    // entities so they pass behind sprites convincingly.
    const ambient = new AmbientParticles();
    worldContainer.addChildAt(ambient.container, 1);

    const input = new Input(worldContainer, socket, app.ticker);

    // Subscribe to store changes → update renderers each frame
    let needsRender = true;
    const unsubscribeStore = useGameStore.subscribe(() => {
      needsRender = true;
    });
    const unsubscribe = () => {
      unsubscribeStore();
      offTheme();
    };

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
      ambient.tick();

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
            sfx.bank();
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

      // Build decorations once we have a node set to avoid them.
      if (!decoBuilt && nodes.size > 0) {
        buildDecorations();
        decoBuilt = true;
      }

      // Camera: centre viewport on the local player's iso position.
      if (localPlayer) {
        const c = tileToIso(localPlayer.x, localPlayer.y);
        worldContainer.x = app.screen.width / 2 - c.x;
        worldContainer.y = app.screen.height / 2 - c.y;
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
