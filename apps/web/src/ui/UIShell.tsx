import { PriceTicker } from "./PriceTicker";
import { ChatDock } from "./ChatDock";
import { Hotbar } from "./Hotbar";
import { useGameStore } from "../state/store";

const STATUS_COLOR: Record<string, string> = {
  connected: "bg-gain-green",
  connecting: "bg-ingot-gold animate-pulse",
  disconnected: "bg-loss-red",
  error: "bg-loss-red",
};

export function UIShell() {
  const status = useGameStore((s) => s.connectionStatus);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col">
      {/* Top bar */}
      <div className="pointer-events-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${STATUS_COLOR[status] ?? "bg-parchment-grey"}`}
          />
          <span className="font-mono text-xs text-parchment-grey/60">{status}</span>
        </div>
        <PriceTicker />
      </div>

      {/* Middle: fills remaining space */}
      <div className="flex-1" />

      {/* Bottom bar */}
      <div className="pointer-events-auto flex items-end justify-between px-4 py-3">
        <ChatDock />
        <Hotbar />
      </div>
    </div>
  );
}
