import { useEffect, useState } from "react";
import { useGameStore } from "../state/store";

const FADE_MS = 1800;

export function DeathOverlay() {
  const lp = useGameStore((s) => s.localPlayer);
  const lastDeath = useGameStore((s) => s.lastDeath);
  const [diedAt, setDiedAt] = useState<number | null>(null);

  useEffect(() => {
    if (lp && lp.maxHp && lp.maxHp > 0 && lp.hp === 0 && diedAt === null) {
      setDiedAt(Date.now());
    } else if (lp && lp.hp && lp.hp > 0 && diedAt !== null) {
      // Player respawned — clear after the fade finishes.
      const elapsed = Date.now() - diedAt;
      const wait = Math.max(0, FADE_MS - elapsed);
      const t = setTimeout(() => setDiedAt(null), wait);
      return () => clearTimeout(t);
    }
  }, [lp, diedAt]);

  if (diedAt === null) return null;

  const elapsed = Date.now() - diedAt;
  const stillDead = lp?.hp === 0;
  const opacity = stillDead ? 0.85 : Math.max(0, 0.85 - (elapsed / FADE_MS) * 0.85);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: `rgba(11, 15, 20, ${opacity})` }}
    >
      <div className="text-center" style={{ opacity }}>
        <div className="text-6xl font-bold text-loss-red drop-shadow-[0_0_20px_rgba(224,69,69,0.8)]">
          You Died
        </div>
        {lastDeath && diedAt && lastDeath.at >= diedAt - 500 && (
          <div className="mt-2 font-mono text-xs uppercase tracking-widest text-parchment-grey/50">
            slain by a {lastDeath.killerName}
          </div>
        )}
        <div className="mt-3 font-mono text-sm uppercase tracking-widest text-parchment-grey/70">
          Respawning…
        </div>
      </div>
    </div>
  );
}
