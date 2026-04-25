import { Graphics, Container } from "pixi.js";
import { TILE_SIZE } from "./TileRenderer";

export interface NodeEntity {
  id: number;
  kind: "rock" | "tree" | "spot";
  x: number;
  y: number;
}

// Center offset so nodes sit in the middle of a tile
const CX = TILE_SIZE / 2;
const CY = TILE_SIZE / 2;

export class NodeRenderer {
  readonly container: Container;
  private sprites = new Map<number, Graphics>();

  constructor() {
    this.container = new Container();
  }

  updateNodes(nodes: Map<number, NodeEntity>): void {
    const seen = new Set<number>();

    for (const [id, node] of nodes) {
      seen.add(id);
      this.upsert(node);
    }

    for (const [id, g] of this.sprites) {
      if (!seen.has(id)) {
        this.container.removeChild(g);
        g.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private upsert(node: NodeEntity): void {
    let g = this.sprites.get(node.id);
    if (!g) {
      g = new Graphics();
      this.sprites.set(node.id, g);
      this.container.addChild(g);
    }

    g.clear();
    g.x = node.x * TILE_SIZE;
    g.y = node.y * TILE_SIZE;

    switch (node.kind) {
      case "rock":
        drawRock(g);
        break;
      case "tree":
        drawTree(g);
        break;
      case "spot":
        drawSpot(g);
        break;
    }
  }
}

function drawRock(g: Graphics): void {
  // Main rock body — earthy brown
  g.ellipse(CX, CY + 4, 18, 13).fill({ color: 0x7a5c3a });
  // Darker spot top-left
  g.ellipse(CX - 6, CY, 6, 5).fill({ color: 0x5a3e20 });
  // Lighter highlight top-right
  g.ellipse(CX + 5, CY - 2, 5, 4).fill({ color: 0x9a7a50 });
  // Outline
  g.ellipse(CX, CY + 4, 18, 13).stroke({ color: 0x3d2a10, width: 1.5 });
}

function drawTree(g: Graphics): void {
  // Trunk — brown rect
  g.rect(CX - 4, CY + 4, 8, 16).fill({ color: 0x6b3a1f });
  // Canopy — dark green circle
  g.circle(CX, CY - 4, 18).fill({ color: 0x2d5a1b });
  // Lighter inner canopy highlight
  g.circle(CX - 4, CY - 8, 9).fill({ color: 0x3d7a25 });
  // Outline
  g.circle(CX, CY - 4, 18).stroke({ color: 0x1a3a0f, width: 1.5 });
}

function drawSpot(g: Graphics): void {
  // Outer ripple
  g.circle(CX, CY, 18).fill({ color: 0x1a6e9f, alpha: 0.5 });
  // Mid ripple
  g.circle(CX, CY, 12).fill({ color: 0x2590cc, alpha: 0.7 });
  // Centre glint
  g.circle(CX, CY, 6).fill({ color: 0x5ac8f5 });
  // Subtle outline
  g.circle(CX, CY, 18).stroke({ color: 0x0d4f7a, width: 1.5 });
}
