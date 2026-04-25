import { Container, Text } from "pixi.js";
import { tileToIso, HALF_H } from "./projection";
import type { FloatingText } from "../state/store";

const LIFE_MS = 1500;
const RISE_PX = 32;

interface Entry {
  text: Text;
  born: number;
  tileX: number;
  tileY: number;
}

export class FloatingTextRenderer {
  readonly container: Container;
  private entries = new Map<string, Entry>();

  constructor() {
    this.container = new Container();
  }

  update(floats: FloatingText[]): void {
    const seen = new Set<string>();

    for (const f of floats) {
      seen.add(f.id);
      if (this.entries.has(f.id)) continue;
      const text = new Text({
        text: f.text,
        style: {
          fontFamily: "monospace",
          fontSize: 14,
          fontWeight: "bold",
          fill: f.color,
          stroke: { color: 0x000000, width: 3 },
          align: "center",
        },
      });
      text.anchor.set(0.5, 1);
      this.entries.set(f.id, { text, born: f.born, tileX: f.tileX, tileY: f.tileY });
      this.container.addChild(text);
    }

    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        this.container.removeChild(entry.text);
        entry.text.destroy();
        this.entries.delete(id);
      }
    }
  }

  /** Per-frame animation — call from ticker */
  tick(): void {
    const now = Date.now();
    for (const entry of this.entries.values()) {
      const t = Math.max(0, Math.min(1, (now - entry.born) / LIFE_MS));
      const c = tileToIso(entry.tileX, entry.tileY);
      // Spawn above the tile (one diamond-height up) and rise from there.
      entry.text.x = c.x;
      entry.text.y = c.y - HALF_H * 2 - t * RISE_PX;
      entry.text.alpha = 1 - t;
    }
  }
}
