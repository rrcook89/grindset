import { useState } from "react";
import { useGameStore } from "../state/store";

export function SkillPanel() {
  const skills = useGameStore((s) => s.skills);
  const levelUpFlash = useGameStore((s) => s.levelUpFlash);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex flex-col rounded border border-ingot-gold/30 bg-obsidian/90 text-parchment-grey">
      <button
        className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-widest text-ingot-gold hover:text-ingot-gold/80"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>Skills</span>
        <span className="ml-2 text-parchment-grey/40">{collapsed ? "+" : "−"}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {skills.map((skill) => {
            const pct = skill.xpToNextLevel > 0
              ? Math.min(100, Math.round((skill.xp / skill.xpToNextLevel) * 100))
              : 100;
            const flashing = levelUpFlash === skill.name;

            return (
              <div
                key={skill.name}
                className={[
                  "rounded px-2 py-1 transition-colors",
                  flashing ? "animate-pulse bg-ingot-gold/20" : "hover:bg-ingot-gold/5",
                ].join(" ")}
                title={`${skill.xp.toLocaleString()} / ${skill.xpToNextLevel.toLocaleString()} XP`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-parchment-grey">{skill.name}</span>
                  <span className="font-mono text-xs font-semibold text-ingot-gold">
                    {skill.level}
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-obsidian">
                  <div
                    className="h-full rounded-full bg-gain-green transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
