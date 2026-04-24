import { useEffect } from "react";
import { useGameStore } from "../state/store";

export function CombatHud() {
  const target = useGameStore((s) => s.combatTarget);
  const hitSplats = useGameStore((s) => s.hitSplats);
  const clearExpired = useGameStore((s) => s.clearExpiredHitSplats);

  // Clean up old hit splats every second
  useEffect(() => {
    const id = setInterval(clearExpired, 1000);
    return () => clearInterval(id);
  }, [clearExpired]);

  const recentSplats = hitSplats.filter((s) => Date.now() - s.timestamp < 2000).slice(-8);

  if (!target && recentSplats.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 flex -translate-x-1/2 flex-col items-center gap-2">
      {/* Target frame */}
      {target && (
        <div className="w-56 rounded border border-loss-red/60 bg-obsidian/90 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-parchment-grey">{target.name}</span>
            <span className="font-mono text-xs text-loss-red">
              {target.hp}/{target.maxHp}
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-obsidian">
            <div
              className="h-full rounded-full bg-loss-red transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (target.hp / target.maxHp) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {/* Hit splats */}
      <div className="relative flex flex-col items-center gap-1">
        {recentSplats.map((splat) => {
          const age = Date.now() - splat.timestamp;
          const opacity = Math.max(0, 1 - age / 2000);
          return (
            <div
              key={splat.id}
              className={[
                "rounded px-2 py-0.5 font-mono text-sm font-bold shadow",
                splat.type === "heal"
                  ? "bg-gain-green/20 text-gain-green"
                  : "bg-loss-red/20 text-loss-red",
              ].join(" ")}
              style={{ opacity }}
            >
              {splat.type === "heal" ? "+" : "-"}
              {splat.amount}
            </div>
          );
        })}
      </div>
    </div>
  );
}
