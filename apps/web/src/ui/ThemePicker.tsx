import { useState } from "react";
import { ALL_THEMES, activeTheme, setTheme, type ThemeId } from "../game/Theme";

export function ThemePicker() {
  const [active, setActive] = useState<ThemeId>(activeTheme().id);

  function handle(id: ThemeId) {
    setTheme(id);
    setActive(id);
  }

  return (
    <div className="flex gap-1 rounded border border-ingot-gold/20 bg-obsidian/80 p-0.5 backdrop-blur-sm">
      {ALL_THEMES.map((t) => (
        <button
          key={t.id}
          className={[
            "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors",
            active === t.id
              ? "bg-ingot-gold/20 text-ingot-gold"
              : "text-parchment-grey/40 hover:text-parchment-grey/70",
          ].join(" ")}
          onClick={() => handle(t.id)}
          title={t.name}
        >
          {t.name.split(" ")[0]}
        </button>
      ))}
    </div>
  );
}
