import { Graphics, Container } from "pixi.js";
import { tileToIso, tileDepth, HALF_H } from "./projection";

export interface NodeEntity {
  id: number;
  kind: "rock" | "tree" | "spot" | "bank" | "furnace" | "firepit";
  /** Optional skill node id (rock_copper, tree_oak, furnace_bronze, …). */
  defId?: string;
  x: number;
  y: number;
}

// Local sprite-space centre — Graphics shapes draw around (CX, CY) and the
// outer Graphics.x/y is set to position the node at its tile centre.
const CX = 0;
const CY = 0;

export class NodeRenderer {
  readonly container: Container;
  private sprites = new Map<number, Graphics>();

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;
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
    const c = tileToIso(node.x, node.y);
    g.x = c.x;
    // Anchor the node so its base sits on the front of the diamond.
    g.y = c.y + HALF_H * 0.5;
    g.zIndex = tileDepth(node.x, node.y) * 10;

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
  // Drop shadow circle scorched into the ground.
  g.ellipse(CX, CY + 6, 16, 5).fill({ color: 0x000000, alpha: 0.5 });
  // Stone ring drawn as a flat ellipse of stones, lighter in front to catch
  // the firelight.
  const ringRX = 14;
  const ringRY = 6;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const sx = CX + Math.cos(a) * ringRX;
    const sy = CY + Math.sin(a) * ringRY + 2;
    const lit = Math.cos(a) > 0 || Math.sin(a) > 0.4;
    g.circle(sx, sy, 2.6).fill({ color: lit ? 0x8a7a64 : 0x4a3a2a });
  }
  // Logs (crossed) — angled to suggest depth
  g.poly([
    CX - 11, CY + 3,
    CX + 11, CY - 1,
    CX + 11, CY + 1,
    CX - 11, CY + 5,
  ]).fill({ color: 0x5a3a1a });
  g.poly([
    CX - 11, CY - 1,
    CX + 11, CY + 3,
    CX + 11, CY + 5,
    CX - 11, CY + 1,
  ]).fill({ color: 0x4a2a10 });
  // Flames — layered teardrops with hot core
  g.poly([
    CX, CY - 14,
    CX + 6, CY - 4,
    CX, CY,
    CX - 6, CY - 4,
  ]).fill({ color: 0xff4020 });
  g.poly([
    CX, CY - 10,
    CX + 4, CY - 4,
    CX, CY - 2,
    CX - 4, CY - 4,
  ]).fill({ color: 0xff8030 });
  g.poly([
    CX, CY - 8,
    CX + 2, CY - 4,
    CX, CY - 4,
    CX - 2, CY - 4,
  ]).fill({ color: 0xffd060 });
  // Sparks
  g.circle(CX - 4, CY - 12, 0.8).fill({ color: 0xffe060, alpha: 0.9 });
  g.circle(CX + 5, CY - 16, 0.7).fill({ color: 0xffe060, alpha: 0.7 });
}

function drawFurnace(g: Graphics, defId?: string): void {
  // Drop shadow
  g.ellipse(CX, CY + 16, 22, 5).fill({ color: 0x000000, alpha: 0.45 });
  // Iso box body — front face + right face + top face
  // Front face (slightly trapezoidal for perspective)
  g.poly([
    CX - 14, CY - 6,
    CX + 6, CY - 6,
    CX + 6, CY + 14,
    CX - 14, CY + 14,
  ]).fill({ color: 0x4a3a2a });
  // Right side face
  g.poly([
    CX + 6, CY - 6,
    CX + 14, CY - 12,
    CX + 14, CY + 8,
    CX + 6, CY + 14,
  ]).fill({ color: 0x2a1a0a });
  // Top face (chimney mouth)
  g.poly([
    CX - 14, CY - 6,
    CX + 6, CY - 6,
    CX + 14, CY - 12,
    CX - 6, CY - 12,
  ]).fill({ color: 0x6a5a4a });
  // Stone seam highlights on the front face
  g.rect(CX - 14, CY + 2, 20, 1).fill({ color: 0x2a1a0a });
  g.rect(CX - 4, CY - 6, 1, 20).fill({ color: 0x2a1a0a });
  // Hearth opening (glowing) — bronze furnace = red, iron = orange
  const glow = defId === "furnace_iron" ? 0xff8030 : 0xff4020;
  const glowEdge = defId === "furnace_iron" ? 0xffd070 : 0xff8040;
  g.roundRect(CX - 10, CY + 2, 14, 10, 2).fill({ color: 0x100404 });
  g.roundRect(CX - 9, CY + 3, 12, 8, 2).fill({ color: glow });
  g.roundRect(CX - 9, CY + 3, 12, 8, 2).stroke({ color: glowEdge, width: 1.2 });
  // Inner flame core
  g.ellipse(CX - 3, CY + 7, 3, 3).fill({ color: 0xffe060, alpha: 0.85 });
  // Smoke plume rising from chimney
  g.ellipse(CX + 4, CY - 16, 5, 4).fill({ color: 0x7a7a7a, alpha: 0.55 });
  g.ellipse(CX - 2, CY - 22, 6, 4).fill({ color: 0x9a9a9a, alpha: 0.4 });
  g.ellipse(CX + 6, CY - 28, 7, 4).fill({ color: 0xcacaca, alpha: 0.25 });
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
  // Soft drop shadow on the ground
  g.ellipse(CX + 2, CY + 8, 18, 5).fill({ color: 0x000000, alpha: 0.3 });
  // Base lump (a chunky boulder seen at 3/4 angle — flat top, slanted sides)
  g.poly([
    CX - 14, CY + 4,
    CX - 10, CY - 6,
    CX + 10, CY - 6,
    CX + 14, CY + 4,
    CX + 8, CY + 10,
    CX - 8, CY + 10,
  ]).fill({ color: c.body });
  // Right-side shadow plane
  g.poly([
    CX + 2, CY - 6,
    CX + 10, CY - 6,
    CX + 14, CY + 4,
    CX + 8, CY + 10,
    CX + 2, CY + 10,
  ]).fill({ color: c.dark });
  // Top facet (lit)
  g.poly([
    CX - 10, CY - 6,
    CX + 10, CY - 6,
    CX + 6, CY - 10,
    CX - 6, CY - 10,
  ]).fill({ color: c.light });
  // A few mineral specks for the ore variant
  g.circle(CX - 4, CY, 1.4).fill({ color: c.light });
  g.circle(CX + 5, CY + 4, 1.2).fill({ color: c.light, alpha: 0.7 });
  // Outline
  g.poly([
    CX - 14, CY + 4,
    CX - 10, CY - 6,
    CX - 6, CY - 10,
    CX + 6, CY - 10,
    CX + 10, CY - 6,
    CX + 14, CY + 4,
    CX + 8, CY + 10,
    CX - 8, CY + 10,
  ]).stroke({ color: 0x1a0a04, width: 1.2 });
}

function drawTree(g: Graphics, defId?: string): void {
  const c = TREE_COLORS[defId ?? "tree_normal"] ?? TREE_COLORS.tree_normal;
  // Drop shadow
  g.ellipse(CX + 2, CY + 18, 14, 4).fill({ color: 0x000000, alpha: 0.35 });
  // Trunk — slightly tapered, with a darker right side
  g.poly([
    CX - 5, CY + 18,
    CX - 4, CY - 2,
    CX + 4, CY - 2,
    CX + 5, CY + 18,
  ]).fill({ color: 0x6b3a1f });
  g.poly([
    CX, CY - 2,
    CX + 4, CY - 2,
    CX + 5, CY + 18,
    CX, CY + 18,
  ]).fill({ color: 0x3a1a0a });
  // Canopy: stacked ellipses for a layered foliage look
  g.ellipse(CX, CY - 6, 18, 12).fill({ color: c.canopy });
  g.ellipse(CX + 4, CY - 4, 11, 7).fill({ color: 0x000000, alpha: 0.25 }); // shadow side
  g.ellipse(CX - 4, CY - 10, 9, 6).fill({ color: c.light });
  g.ellipse(CX - 8, CY - 4, 6, 5).fill({ color: c.canopy });
  g.ellipse(CX + 6, CY - 12, 7, 5).fill({ color: c.canopy });
  // Tiny highlight dot
  g.circle(CX - 6, CY - 12, 1.2).fill({ color: c.light });
}

function drawBank(g: Graphics): void {
  // Drop shadow
  g.ellipse(CX, CY + 14, 16, 4).fill({ color: 0x000000, alpha: 0.4 });
  // Box body in iso — front face + right face + top face
  // Front face (parallelogram leaning right)
  g.poly([
    CX - 14, CY - 4,
    CX + 6, CY - 4,
    CX + 6, CY + 12,
    CX - 14, CY + 12,
  ]).fill({ color: 0x6b3a1f });
  // Right face
  g.poly([
    CX + 6, CY - 4,
    CX + 14, CY - 8,
    CX + 14, CY + 8,
    CX + 6, CY + 12,
  ]).fill({ color: 0x3a1a0a });
  // Top face (iso lid)
  g.poly([
    CX - 14, CY - 4,
    CX + 6, CY - 4,
    CX + 14, CY - 8,
    CX - 6, CY - 8,
  ]).fill({ color: 0x7a4a25 });
  // Gold trim band at the lid line
  g.rect(CX - 14, CY - 4, 20, 2).fill({ color: 0xf5c14b });
  g.poly([
    CX + 6, CY - 4,
    CX + 14, CY - 8,
    CX + 14, CY - 6,
    CX + 6, CY - 2,
  ]).fill({ color: 0xd4a017 });
  // Lock plate
  g.rect(CX - 3, CY + 2, 6, 6).fill({ color: 0xf5c14b });
  g.rect(CX - 1, CY + 4, 2, 4).fill({ color: 0x3a1a0a });
  // "B" floating label — a small banner-ish circle with an inner glyph
  g.circle(CX, CY - 18, 7).fill({ color: 0xf5c14b, alpha: 0.9 });
  g.circle(CX, CY - 18, 5).stroke({ color: 0x6b3a1f, width: 1.5 });
}

function drawSpot(g: Graphics, defId?: string): void {
  const c = SPOT_COLORS[defId ?? "spot_shrimp"] ?? SPOT_COLORS.spot_shrimp;
  // Diamond ripples matching the iso footprint instead of round circles —
  // the surface of the water lies flat on the tile.
  const ripple = (rx: number, ry: number, color: number, alpha: number) => {
    g.poly([0, -ry, rx, 0, 0, ry, -rx, 0]).fill({ color, alpha });
  };
  ripple(20, 9, 0x0a3a5a, 0.6);
  ripple(15, 7, c.mid, 0.7);
  ripple(9, 4, c.centre, 0.85);
  // Sparkle dots
  g.circle(CX - 3, CY - 1, 1).fill({ color: 0xffffff, alpha: 0.9 });
  g.circle(CX + 4, CY + 1, 0.7).fill({ color: 0xffffff, alpha: 0.6 });
}
