import { Graphics, Container } from "pixi.js";
import { TILE_SIZE } from "./TileRenderer";

export interface NodeEntity {
  id: number;
  kind: "rock" | "tree" | "spot" | "bank" | "furnace" | "firepit";
  /** Optional skill node id (rock_copper, tree_oak, furnace_bronze, …). */
  defId?: string;
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
        drawRock(g, node.defId);
        break;
      case "tree":
        drawTree(g, node.defId);
        break;
      case "spot":
        drawSpot(g, node.defId);
        break;
      case "bank":
        drawBank(g);
        break;
      case "furnace":
        drawFurnace(g, node.defId);
        break;
      case "firepit":
        drawFirepit(g);
        break;
    }
  }
}

function drawFirepit(g: Graphics): void {
  // Stone ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = CX + Math.cos(a) * 14;
    const sy = CY + Math.sin(a) * 10 + 4;
    g.circle(sx, sy, 3).fill({ color: 0x6a5a4a });
  }
  // Logs (crossed)
  g.rect(CX - 12, CY + 1, 24, 3).fill({ color: 0x5a3a1a });
  g.rect(CX - 12, CY + 5, 24, 3).fill({ color: 0x4a2a10 });
  // Flames — three flickering triangles approximated as ellipses
  g.ellipse(CX, CY - 4, 6, 10).fill({ color: 0xff5020 });
  g.ellipse(CX - 5, CY - 1, 4, 7).fill({ color: 0xff8030 });
  g.ellipse(CX + 5, CY - 1, 4, 7).fill({ color: 0xff8030 });
  g.ellipse(CX, CY - 8, 3, 6).fill({ color: 0xffd060 });
}

function drawFurnace(g: Graphics, defId?: string): void {
  // Stone base
  g.roundRect(CX - 16, CY - 4, 32, 22, 3).fill({ color: 0x4a3a2a });
  g.roundRect(CX - 16, CY - 4, 32, 22, 3).stroke({ color: 0x2a1a0a, width: 1.5 });
  // Hearth opening (glowing)
  const glow = defId === "furnace_iron" ? 0xff8030 : 0xff4020;
  g.roundRect(CX - 9, CY + 2, 18, 12, 2).fill({ color: glow });
  g.roundRect(CX - 9, CY + 2, 18, 12, 2).stroke({ color: 0xff6020, width: 1, alpha: 0.6 });
  // Smoke puffs above (suggested with 3 ovals)
  g.ellipse(CX - 6, CY - 12, 5, 4).fill({ color: 0x7a7a7a, alpha: 0.5 });
  g.ellipse(CX + 4, CY - 16, 6, 5).fill({ color: 0x9a9a9a, alpha: 0.4 });
  g.ellipse(CX, CY - 22, 7, 4).fill({ color: 0xcacaca, alpha: 0.25 });
}

const ROCK_COLORS: Record<string, { body: number; dark: number; light: number }> = {
  rock_copper:  { body: 0x7a5c3a, dark: 0x5a3e20, light: 0xb87333 },
  rock_iron:    { body: 0x6a6a6a, dark: 0x444444, light: 0x9a9a9a },
  rock_coal:    { body: 0x2a2a2a, dark: 0x111111, light: 0x4a4a4a },
  rock_mithril: { body: 0x4a6c8c, dark: 0x2a4060, light: 0x7aa0c0 },
};
const TREE_COLORS: Record<string, { canopy: number; light: number }> = {
  tree_normal: { canopy: 0x2d5a1b, light: 0x3d7a25 },
  tree_oak:    { canopy: 0x355030, light: 0x556a40 },
  tree_willow: { canopy: 0x6a8c3a, light: 0x8aac5a },
  tree_yew:    { canopy: 0x1a3a2a, light: 0x2a5a40 },
};
const SPOT_COLORS: Record<string, { mid: number; centre: number }> = {
  spot_shrimp:    { mid: 0x2590cc, centre: 0x5ac8f5 },
  spot_trout:     { mid: 0x3a8090, centre: 0x80b8c8 },
  spot_lobster:   { mid: 0xcc4040, centre: 0xf08080 },
  spot_swordfish: { mid: 0x404090, centre: 0x80a0d0 },
};

function drawRock(g: Graphics, defId?: string): void {
  const c = ROCK_COLORS[defId ?? "rock_copper"] ?? ROCK_COLORS.rock_copper;
  g.ellipse(CX, CY + 4, 18, 13).fill({ color: c.body });
  g.ellipse(CX - 6, CY, 6, 5).fill({ color: c.dark });
  g.ellipse(CX + 5, CY - 2, 5, 4).fill({ color: c.light });
  g.ellipse(CX, CY + 4, 18, 13).stroke({ color: 0x3d2a10, width: 1.5 });
}

function drawTree(g: Graphics, defId?: string): void {
  const c = TREE_COLORS[defId ?? "tree_normal"] ?? TREE_COLORS.tree_normal;
  // Trunk — brown rect
  g.rect(CX - 4, CY + 4, 8, 16).fill({ color: 0x6b3a1f });
  // Canopy
  g.circle(CX, CY - 4, 18).fill({ color: c.canopy });
  g.circle(CX - 4, CY - 8, 9).fill({ color: c.light });
  // Outline
  g.circle(CX, CY - 4, 18).stroke({ color: 0x1a3a0f, width: 1.5 });
}

function drawBank(g: Graphics): void {
  // Wooden chest with gold trim
  // Body
  g.roundRect(CX - 14, CY - 6, 28, 18, 2).fill({ color: 0x6b3a1f });
  // Lid
  g.roundRect(CX - 14, CY - 14, 28, 10, 2).fill({ color: 0x7a4a25 });
  // Gold trim band
  g.rect(CX - 14, CY - 6, 28, 2).fill({ color: 0xf5c14b });
  // Lock plate
  g.rect(CX - 3, CY - 3, 6, 6).fill({ color: 0xf5c14b });
  g.rect(CX - 1, CY - 1, 2, 4).fill({ color: 0x6b3a1f });
  // Outline
  g.roundRect(CX - 14, CY - 14, 28, 26, 2).stroke({ color: 0x3d2010, width: 1.5 });
  // "B" label above
  g.circle(CX, CY - 22, 7).fill({ color: 0xf5c14b, alpha: 0.85 });
}

function drawSpot(g: Graphics, defId?: string): void {
  const c = SPOT_COLORS[defId ?? "spot_shrimp"] ?? SPOT_COLORS.spot_shrimp;
  g.circle(CX, CY, 18).fill({ color: 0x1a6e9f, alpha: 0.5 });
  g.circle(CX, CY, 12).fill({ color: c.mid, alpha: 0.7 });
  g.circle(CX, CY, 6).fill({ color: c.centre });
  g.circle(CX, CY, 18).stroke({ color: 0x0d4f7a, width: 1.5 });
}
