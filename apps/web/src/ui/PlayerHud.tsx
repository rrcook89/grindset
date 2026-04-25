import { useState } from "react";
import { useGameStore } from "../state/store";
import { isMuted, setMuted } from "../game/Sfx";

export function PlayerHud() {
  const lp = useGameStore((s) => s.localPlayer);
  const [muted, setMutedState] = useState(isMuted());

  if (!lp) return null;

  const hp = lp.hp ?? 0;
  const maxHp = lp.maxHp ?? 0;
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }

  return (
    <div className="w-44 rounded border border-gain-green/40 bg-obsidian/90 px-3 py-2">
      {maxHp > 0 && (
        <>
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
        </>
      )}
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-parchment-grey/60">
        <span className="font-mono">
          ({lp.x}, {lp.y})
        </span>
        <button
          className="rounded border border-parchment-grey/20 px-1.5 py-0.5 hover:border-parchment-grey/50 hover:text-parchment-grey"
          onClick={toggleMute}
          title={muted ? "Unmute SFX" : "Mute SFX"}
        >
          {muted ? "♪ off" : "♪ on"}
        </button>
      </div>
    </div>
  );
}
