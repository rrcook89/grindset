import { useEffect, useState } from "react";
import { useGameStore } from "../state/store";

const GRIND_BASE = 1_000_000_000n;

function formatGrind(units: bigint): string {
  const whole = units / GRIND_BASE;
  const frac = units % GRIND_BASE;
  if (frac === 0n) return `${whole}`;
  // Show up to 3 decimals.
  const fracStr = (frac * 1000n / GRIND_BASE).toString().padStart(3, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function formatPlaytime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function StatsPanel() {
  const sessionStart = useGameStore((s) => s.sessionStart);
  const totalKills = useGameStore((s) => s.totalKills);
  const totalGrindEarned = useGameStore((s) => s.totalGrindEarned);
  const wallet = useGameStore((s) => s.wallet);
  const skills = useGameStore((s) => s.skills);
  const quests = useGameStore((s) => s.quests);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalLevels = skills.reduce((sum, s) => sum + s.level, 0);
  const totalXP = skills.reduce((sum, s) => sum + s.xp, 0);
  const questsDone = quests.filter((q) => q.status === "complete").length;

  return (
    <div className="flex w-56 flex-col rounded border border-ingot-gold/30 bg-obsidian/90 text-parchment-grey">
      <div className="border-b border-ingot-gold/20 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-ingot-gold">
        Stats
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 px-3 py-2 text-xs">
        <dt className="text-parchment-grey/50">Playtime</dt>
        <dd className="text-right font-mono text-parchment-grey">
          {formatPlaytime(now - sessionStart)}
        </dd>

        <dt className="text-parchment-grey/50">Total level</dt>
        <dd className="text-right font-mono text-ingot-gold">{totalLevels}</dd>

        <dt className="text-parchment-grey/50">Total XP</dt>
        <dd className="text-right font-mono text-parchment-grey">
          {totalXP.toLocaleString()}
        </dd>

        <dt className="text-parchment-grey/50">Mob kills</dt>
        <dd className="text-right font-mono text-loss-red">{totalKills}</dd>

        <dt className="text-parchment-grey/50">Quests done</dt>
        <dd className="text-right font-mono text-gain-green">{questsDone}</dd>

        <dt className="border-t border-ingot-gold/10 pt-1.5 text-parchment-grey/50">
          $GRIND now
        </dt>
        <dd className="border-t border-ingot-gold/10 pt-1.5 text-right font-mono text-ingot-gold">
          {formatGrind(wallet.balance)}
        </dd>

        <dt className="text-parchment-grey/50">$GRIND earned</dt>
        <dd className="text-right font-mono text-ingot-gold">
          {formatGrind(totalGrindEarned)}
        </dd>
      </dl>
    </div>
  );
}
