import { useEffect, useState, useCallback } from "react";
import { useGameStore } from "../state/store";
import { getActiveSocket } from "../net/Socket";
import { encodeAbilityUse } from "../net/protocol";

const ABILITY_SLOTS = 5;

function CooldownOverlay({ cooldownMs, cooldownStart }: { cooldownMs: number; cooldownStart: number }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!cooldownStart || !cooldownMs) { setRemaining(0); return; }
    const tick = () => {
      const elapsed = Date.now() - cooldownStart;
      const left = Math.max(0, cooldownMs - elapsed);
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [cooldownMs, cooldownStart]);

  if (!remaining) return null;

  const pct = remaining / cooldownMs;

  return (
    <div className="absolute inset-0 flex items-center justify-center rounded bg-obsidian/70">
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
        <circle
          cx="18" cy="18" r="14"
          fill="none"
          stroke="#F5C14B"
          strokeWidth="2"
          strokeDasharray={`${pct * 87.96} 87.96`}
          strokeLinecap="round"
        />
      </svg>
      <span className="z-10 font-mono text-[10px] text-ingot-gold">
        {(remaining / 1000).toFixed(1)}
      </span>
    </div>
  );
}

export function Hotbar() {
  const abilities = useGameStore((s) => s.abilities);
  const triggerCooldown = useGameStore((s) => s.triggerAbilityCooldown);

  const fireSlot = useCallback(
    (slotIndex: number) => {
      const ability = abilities[slotIndex];
      if (!ability?.id) return;
      const elapsed = ability.cooldownStart ? Date.now() - ability.cooldownStart : Infinity;
      if (elapsed < ability.cooldownMs) return; // still cooling
      triggerCooldown(slotIndex);
      const socket = getActiveSocket();
      socket?.sendRaw(encodeAbilityUse(slotIndex));
    },
    [abilities, triggerCooldown],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= ABILITY_SLOTS) fireSlot(n - 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fireSlot]);

  return (
    <div className="flex gap-1 rounded border border-ingot-gold/20 bg-obsidian/80 p-1 backdrop-blur-sm">
      {Array.from({ length: ABILITY_SLOTS }, (_, i) => {
        const ability = abilities[i];
        const hasAbility = ability && ability.id !== 0;

        return (
          <button
            key={i}
            data-testid={`hotbar-slot-${i}`}
            className="relative flex h-12 w-12 items-center justify-center rounded border border-ingot-gold/20 bg-obsidian hover:border-ingot-gold/60"
            onClick={() => fireSlot(i)}
            title={hasAbility ? ability.name : `Slot ${i + 1}`}
          >
            {hasAbility && (
              <div
                className="h-9 w-9 rounded"
                style={{ backgroundColor: ability.color }}
              />
            )}
            {hasAbility && ability.cooldownStart > 0 && (
              <CooldownOverlay
                cooldownMs={ability.cooldownMs}
                cooldownStart={ability.cooldownStart}
              />
            )}
            <span className="absolute bottom-0.5 right-1 font-mono text-[9px] text-parchment-grey/30">
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
