/**
 * Programmatically generated sound effects via Web Audio. No assets needed.
 * All sounds are short blips/sweeps so they don't fight with the user's
 * background music. Audio context is created lazily on first play to avoid
 * autoplay-policy warnings.
 */

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Klass = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? AudioContext;
      ctx = new Klass();
    } catch {
      return null;
    }
  }
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

interface BlipOptions {
  freq: number;
  duration: number; // seconds
  type?: OscillatorType;
  /** End-frequency for a sweep, otherwise constant pitch. */
  endFreq?: number;
  /** Gain envelope peak (0..1). */
  gain?: number;
}

function blip(o: BlipOptions): void {
  const c = getCtx();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, now);
  if (o.endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(0.001, o.endFreq), now + o.duration);
  }
  const peak = o.gain ?? 0.06;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + o.duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(now);
  osc.stop(now + o.duration);
}

export const sfx = {
  /** Mining/woodcutting/fishing tick — short metallic ping. */
  skillTick(): void {
    blip({ freq: 880, endFreq: 660, duration: 0.08, type: "triangle", gain: 0.05 });
  },
  /** Player landed a hit on a mob. */
  hit(): void {
    blip({ freq: 220, endFreq: 110, duration: 0.1, type: "square", gain: 0.07 });
  },
  /** Player landed a critical hit. */
  crit(): void {
    blip({ freq: 660, endFreq: 220, duration: 0.18, type: "sawtooth", gain: 0.09 });
  },
  /** Player took damage. */
  hurt(): void {
    blip({ freq: 140, endFreq: 90, duration: 0.16, type: "sawtooth", gain: 0.08 });
  },
  /** Mob died / kill confirmed. */
  kill(): void {
    blip({ freq: 440, endFreq: 880, duration: 0.18, type: "triangle", gain: 0.08 });
  },
  /** Level-up jingle (3 ascending notes). */
  levelUp(): void {
    const c = getCtx();
    if (!c) return;
    blip({ freq: 523, duration: 0.12, type: "triangle", gain: 0.08 });
    setTimeout(() => blip({ freq: 659, duration: 0.12, type: "triangle", gain: 0.08 }), 100);
    setTimeout(() => blip({ freq: 784, duration: 0.18, type: "triangle", gain: 0.10 }), 200);
  },
  /** Player died — descending wah. */
  death(): void {
    blip({ freq: 220, endFreq: 55, duration: 0.5, type: "sawtooth", gain: 0.10 });
  },
  /** Item picked up (skill-tick item or mob loot). */
  loot(): void {
    blip({ freq: 1320, endFreq: 1760, duration: 0.06, type: "sine", gain: 0.05 });
  },
  /** Ability fired (Heavy Strike / Bandage). */
  ability(): void {
    blip({ freq: 1100, endFreq: 1660, duration: 0.1, type: "triangle", gain: 0.06 });
  },
  /** Bank opened. */
  bank(): void {
    blip({ freq: 660, duration: 0.05, type: "sine", gain: 0.05 });
    setTimeout(() => blip({ freq: 880, duration: 0.06, type: "sine", gain: 0.05 }), 60);
  },
};
