import { Container, Graphics } from "pixi.js";
import { tileToIso, GRID_W, GRID_H, HALF_H } from "./projection";
import { activeTheme } from "./Theme";

interface Particle {
  g: Graphics;
  bornAt: number;
  lifetime: number; // ms
  startX: number;
  startY: number;
  driftX: number;  // px drift over lifetime
  driftY: number;
}

const MAX_LIVE = 24;
const SPAWN_INTERVAL_MS = 350;

/**
 * Drifting ambient "fireflies" — tiny glowing dots scattered around the
 * playable area. Pure cosmetic, no gameplay effect.
 */
export class AmbientParticles {
  readonly container: Container;
  private particles: Particle[] = [];
  private lastSpawn = 0;

  constructor() {
    this.container = new Container();
  }

  tick(): void {
    const now = performance.now();

    // Cull expired particles.
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      const t = (now - p.bornAt) / p.lifetime;
      if (t >= 1) {
        this.container.removeChild(p.g);
        p.g.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      // Drift + fade. Bell-curve alpha so they fade in AND out.
      const alpha = Math.sin(t * Math.PI);
      p.g.x = p.startX + p.driftX * t;
      p.g.y = p.startY + p.driftY * t;
      p.g.alpha = alpha;
    }

    // Spawn replacements at a slow rate.
    if (now - this.lastSpawn >= SPAWN_INTERVAL_MS && this.particles.length < MAX_LIVE) {
      this.lastSpawn = now;
      this.spawn();
    }
  }

  private spawn(): void {
    const theme = activeTheme();
    // Pick a random tile in the world, then jitter slightly within it.
    const col = Math.random() * (GRID_W - 1);
    const row = Math.random() * (GRID_H - 1);
    const c = tileToIso(col, row);

    const g = new Graphics();
    const r = 1.5 + Math.random() * 2;
    g.circle(0, 0, r).fill({ color: theme.spotGlow, alpha: 1 });
    g.circle(0, 0, r * 2).fill({ color: theme.spotGlow, alpha: 0.18 });

    const p: Particle = {
      g,
      bornAt: performance.now(),
      lifetime: 2500 + Math.random() * 2000,
      startX: c.x + (Math.random() - 0.5) * 16,
      startY: c.y - HALF_H * 0.5,
      driftX: (Math.random() - 0.5) * 14,
      driftY: -10 - Math.random() * 14, // float upward
    };
    this.particles.push(p);
    this.container.addChild(g);
  }
}
