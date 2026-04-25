import type { FederatedPointerEvent, Ticker } from "pixi.js";
import { Graphics, Container } from "pixi.js";
import { encodeMoveIntent, encodeSkillStart, encodeCombatTarget } from "../net/protocol";
import type { GameSocket } from "../net/Socket";
import { useGameStore } from "../state/store";
import { isoToTile, tileToIso, GRID_W, GRID_H, tileDepth, HALF_W, HALF_H } from "./projection";
import { sfx } from "./Sfx";

const MARKER_COLOR = 0xe04545; // GRINDSET loss-red
const MARKER_LIFE_MS = 700;

interface ClickMarker {
  graphics: Graphics;
  bornAt: number;
}

export class Input {
  private markers: ClickMarker[] = [];

  constructor(
    private readonly worldContainer: Container,
    private readonly socket: GameSocket,
    ticker: Ticker,
  ) {
    this.worldContainer.eventMode = "static";
    this.worldContainer.on("pointerdown", this.onPointerDown);
    ticker.add(this.tick);
  }

  private onPointerDown = (e: FederatedPointerEvent): void => {
    const local = e.getLocalPosition(this.worldContainer);
    // Inverse-iso: pixel → tile (col, row).
    const t = isoToTile(local.x, local.y);
    const tileX = Math.floor(t.col + 0.5);
    const tileY = Math.floor(t.row + 0.5);

    if (tileX < 0 || tileY < 0 || tileX >= GRID_W || tileY >= GRID_H) return;

    // Click priority: mob > node > walk.
    const { nodes, mobs } = useGameStore.getState();

    let mobAtTile: { id: number } | null = null;
    for (const mob of mobs.values()) {
      if (mob.x === tileX && mob.y === tileY) {
        mobAtTile = { id: mob.id };
        break;
      }
    }

    if (mobAtTile) {
      this.socket.sendRaw(encodeCombatTarget(mobAtTile.id));
      useGameStore.getState().setSkillTarget(null);
      this.spawnMarker(tileX, tileY);
      return;
    }

    let nodeAtTile: { id: number; kind: string } | null = null;
    for (const node of nodes.values()) {
      if (node.x === tileX && node.y === tileY) {
        nodeAtTile = { id: node.id, kind: node.kind };
        break;
      }
    }

    if (nodeAtTile) {
      if (nodeAtTile.kind === "bank") {
        // Walk to the bank tile; if already adjacent, open immediately.
        const lp = useGameStore.getState().localPlayer;
        const adjacent = lp
          ? Math.max(Math.abs(lp.x - tileX), Math.abs(lp.y - tileY)) <= 1
          : false;
        if (adjacent) {
          const store = useGameStore.getState();
          store.setBankOpen(true);
          // Welcome-to-Mireholm quest: tick "Visit the bank" once.
          store.incQuestObjective("welcome_to_mireholm", 2, 1);
          sfx.bank();
        } else {
          this.socket.sendRaw(encodeMoveIntent(tileX, tileY));
        }
      } else {
        this.socket.sendRaw(encodeSkillStart(nodeAtTile.id));
        useGameStore.getState().setSkillTarget(nodeAtTile.id);
      }
    } else {
      this.socket.sendRaw(encodeMoveIntent(tileX, tileY));
      useGameStore.getState().setSkillTarget(null);
    }
    this.spawnMarker(tileX, tileY);
  };

  private spawnMarker(tileX: number, tileY: number): void {
    const g = new Graphics();
    const c = tileToIso(tileX, tileY);
    g.x = c.x;
    g.y = c.y;
    g.zIndex = tileDepth(tileX, tileY) * 10 + 5;
    this.worldContainer.addChild(g);
    this.markers.push({ graphics: g, bornAt: performance.now() });
  }

  private tick = (): void => {
    const now = performance.now();
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      const t = (now - m.bornAt) / MARKER_LIFE_MS; // 0..1
      if (t >= 1) {
        this.worldContainer.removeChild(m.graphics);
        m.graphics.destroy();
        this.markers.splice(i, 1);
        continue;
      }
      // Diamond ring expanding to match the iso tile footprint, then fading.
      const scale = 0.5 + 1.0 * t; // 0.5 → 1.5
      const rx = (HALF_W - 6) * scale;
      const ry = (HALF_H - 3) * scale;
      const alpha = 1 - t;
      m.graphics.clear();
      m.graphics.poly([
        0, -ry,
        rx, 0,
        0, ry,
        -rx, 0,
      ]).stroke({ color: MARKER_COLOR, width: 2, alpha });
      // Inner pulse dot fades out faster.
      const innerAlpha = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      m.graphics.circle(0, 0, 3).fill({ color: MARKER_COLOR, alpha: innerAlpha });
    }
  };

  destroy(): void {
    this.worldContainer.off("pointerdown", this.onPointerDown);
    for (const m of this.markers) {
      this.worldContainer.removeChild(m.graphics);
      m.graphics.destroy();
    }
    this.markers = [];
  }
}
