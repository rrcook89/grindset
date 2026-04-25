import { useGameStore } from "../state/store";
import { ChatDock } from "./ChatDock";
import { Hotbar } from "./Hotbar";
import { WalletHud } from "./WalletHud";
import { SkillPanel } from "./SkillPanel";
import { StatsPanel } from "./StatsPanel";
import { Inventory } from "./Inventory";
import { CombatHud } from "./CombatHud";
import { PlayerHud } from "./PlayerHud";
import { DeathOverlay } from "./DeathOverlay";
import { TutorialOverlay } from "./TutorialOverlay";
import { MiniMap } from "./MiniMap";
import { BankModal } from "./BankModal";
import { GrandBazaar } from "./GrandBazaar";
import { QuestLog } from "./QuestLog";
import { useState } from "react";

const STATUS_COLOR: Record<string, string> = {
  connected: "bg-gain-green",
  connecting: "bg-ingot-gold animate-pulse",
  disconnected: "bg-loss-red",
  error: "bg-loss-red",
};

type RightPanel = "inventory" | "skills" | "quests" | "stats" | null;

export function UIShell() {
  const status = useGameStore((s) => s.connectionStatus);
  const setGEOpen = useGameStore((s) => s.setGEOpen);
  const [rightPanel, setRightPanel] = useState<RightPanel>("inventory");

  function togglePanel(panel: RightPanel) {
    setRightPanel((cur) => (cur === panel ? null : panel));
  }

  return (
    <>
      {/* Modals + global overlays (outside pointer-events layer) */}
      <BankModal />
      <GrandBazaar />
      <DeathOverlay />
      <TutorialOverlay />

      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {/* ── Top bar ─────────────────────────────────────────── */}
        <div className="pointer-events-auto flex items-start justify-between px-4 py-3">
          {/* Left: connection status + player HP */}
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${STATUS_COLOR[status] ?? "bg-parchment-grey"}`}
              />
              <span className="font-mono text-xs text-parchment-grey/60">{status}</span>
            </div>
            <PlayerHud />
          </div>

          {/* Centre: Combat HUD sits absolutely, no space needed here */}

          {/* Right: MiniMap + Wallet + GE button */}
          <div className="flex flex-col items-end gap-2">
            <MiniMap />
            <WalletHud />
            <button
              className="rounded border border-ingot-gold/30 bg-obsidian/80 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-ingot-gold backdrop-blur-sm hover:bg-ingot-gold/10"
              onClick={() => setGEOpen(true)}
            >
              Grand Bazaar
            </button>
          </div>
        </div>

        {/* ── Combat HUD (absolutely centred) ─────────────────── */}
        <CombatHud />

        {/* ── Middle stretch ────────────────────────────────────── */}
        <div className="flex flex-1 items-start justify-end px-4 pt-2">
          {/* Right panel switcher */}
          <div className="pointer-events-auto flex flex-col gap-2">
            {/* Tab buttons */}
            <div className="flex flex-col gap-1 rounded border border-ingot-gold/20 bg-obsidian/80 p-1 backdrop-blur-sm">
              {(["inventory", "skills", "quests", "stats"] as RightPanel[]).map((p) => (
                <button
                  key={p}
                  className={[
                    "rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors",
                    rightPanel === p
                      ? "bg-ingot-gold/10 text-ingot-gold"
                      : "text-parchment-grey/40 hover:text-parchment-grey/70",
                  ].join(" ")}
                  onClick={() => togglePanel(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Panel content */}
            {rightPanel === "inventory" && <Inventory />}
            {rightPanel === "skills" && <SkillPanel />}
            {rightPanel === "quests" && <QuestLog />}
            {rightPanel === "stats" && <StatsPanel />}
          </div>
        </div>

        {/* ── Bottom bar ────────────────────────────────────────── */}
        <div className="pointer-events-auto flex items-end justify-between px-4 py-3">
          <ChatDock />
          <Hotbar />
        </div>
      </div>
    </>
  );
}
