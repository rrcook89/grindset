import { useState } from "react";
import { useGameStore } from "../state/store";
import type { Quest } from "../net/types";

function QuestItem({ quest }: { quest: Quest }) {
  const [open, setOpen] = useState(false);
  const allDone = quest.objectives.every((o) => o.current >= o.target);

  return (
    <div className="border-b border-ingot-gold/10 last:border-0">
      <button
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ingot-gold/5"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <span
            className={[
              "h-2 w-2 rounded-full",
              quest.status === "complete" ? "bg-gain-green" : allDone ? "bg-ingot-gold" : "bg-parchment-grey/30",
            ].join(" ")}
          />
          <span className={quest.status === "complete" ? "text-parchment-grey/50 line-through" : "text-parchment-grey"}>
            {quest.name}
          </span>
        </div>
        <span className="text-parchment-grey/30">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="px-5 pb-3">
          {quest.objectives.map((obj, i) => {
            const pct = Math.min(100, Math.round((obj.current / obj.target) * 100));
            const done = obj.current >= obj.target;
            return (
              <div key={i} className="mt-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className={done ? "text-parchment-grey/40 line-through" : "text-parchment-grey/80"}>
                    {obj.description}
                  </span>
                  <span className="font-mono text-parchment-grey/50">
                    {obj.current}/{obj.target}
                  </span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-obsidian">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${done ? "bg-gain-green" : "bg-ingot-gold"}`}
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

export function QuestLog() {
  const quests = useGameStore((s) => s.quests);
  const [showComplete, setShowComplete] = useState(false);

  const active = quests.filter((q) => q.status === "active");
  const complete = quests.filter((q) => q.status === "complete");
  const visible: Quest[] = showComplete ? quests : active;

  return (
    <div className="flex w-64 flex-col rounded border border-ingot-gold/30 bg-obsidian/90">
      <div className="flex items-center justify-between border-b border-ingot-gold/20 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-ingot-gold">
          Quest Log
        </span>
        <button
          className="text-xs text-parchment-grey/40 hover:text-parchment-grey/70"
          onClick={() => setShowComplete((s) => !s)}
        >
          {showComplete ? "Hide done" : `+${complete.length} done`}
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-xs text-parchment-grey/30">No active quests</p>
        ) : (
          visible.map((q) => <QuestItem key={q.id} quest={q} />)
        )}
      </div>
    </div>
  );
}
