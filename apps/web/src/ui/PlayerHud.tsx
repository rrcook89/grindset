import { useGameStore } from "../state/store";

export function PlayerHud() {
  const lp = useGameStore((s) => s.localPlayer);
  if (!lp) return null;

  const hp = lp.hp ?? 0;
  const maxHp = lp.maxHp ?? 0;
  if (maxHp === 0) return null;

  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  return (
    <div className="w-44 rounded border border-gain-green/40 bg-obsidian/90 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-gain-green">HP</span>
        <span className="font-mono text-xs text-parchment-grey">
          {hp}/{maxHp}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-obsidian">
        <div
          className="h-full rounded-full bg-gain-green transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
