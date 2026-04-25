import { useEffect, useState } from "react";

const STORAGE_KEY = "grindset_tutorial_seen";

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Welcome to GRINDSET",
    body: "OSRS-style click-to-move, top-down. Server-authoritative — your client only sends intents.",
  },
  {
    title: "Walk",
    body: "Left-click any empty tile. Your wizard walks one tile per game tick (400 ms).",
  },
  {
    title: "Mine, chop, fish",
    body: "Click a brown rock, green tree, or blue spot. You'll walk to it and start gathering — XP, items, and a pinch of $GRIND drop every few ticks.",
  },
  {
    title: "Combat",
    body: "Click a red mob to attack. Goblins (radius 4) and bandits (radius 6) chase you back. Rats are passive. Watch your HP bar — die and you respawn at the zone centre.",
  },
  {
    title: "Bank",
    body: "The wooden chest at (26, 25) is the bank. Walk next to it and the bank panel opens automatically. Drag inventory items in to deposit.",
  },
  {
    title: "Chat",
    body: "Bottom-left dock — type into another tab to broadcast cross-tab. Channels work but only 'global' is wired in dispatch right now.",
  },
];

export function TutorialOverlay() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function dismiss() {
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }

  return (
    <div className="pointer-events-auto fixed bottom-24 right-4 z-40 w-80 rounded border border-ingot-gold/40 bg-obsidian/95 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-ingot-gold/20 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-ingot-gold">
          {current.title}
        </span>
        <span className="font-mono text-[10px] text-parchment-grey/40">
          {step + 1}/{STEPS.length}
        </span>
      </div>
      <div className="px-4 py-3 text-sm leading-snug text-parchment-grey/85">
        {current.body}
      </div>
      <div className="flex items-center justify-between border-t border-ingot-gold/20 px-3 py-2">
        <button
          className="text-xs uppercase tracking-widest text-parchment-grey/50 hover:text-parchment-grey"
          onClick={dismiss}
        >
          Skip
        </button>
        <div className="flex gap-2">
          {step > 0 && (
            <button
              className="rounded border border-parchment-grey/20 px-3 py-1 text-xs uppercase tracking-widest text-parchment-grey/70 hover:border-parchment-grey/50 hover:text-parchment-grey"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          )}
          <button
            className="rounded border border-ingot-gold/40 bg-ingot-gold/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ingot-gold hover:bg-ingot-gold/20"
            onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
          >
            {isLast ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
