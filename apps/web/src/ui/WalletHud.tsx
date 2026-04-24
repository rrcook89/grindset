import { useGameStore } from "../state/store";
import type { LedgerEntry } from "../net/types";

/** 1 $GRIND = 1_000_000 base units (like SOL lamports) */
const BASE_UNITS = 1_000_000n;

export function formatGrind(baseUnits: bigint): string {
  const whole = baseUnits / BASE_UNITS;
  const frac = baseUnits % BASE_UNITS;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole.toLocaleString()}.${fracStr}` : whole.toLocaleString();
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const sign = entry.direction === "in" ? "+" : "-";
  const color = entry.direction === "in" ? "text-gain-green" : "text-loss-red";
  const date = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="max-w-[9rem] truncate text-parchment-grey/70">{entry.description}</span>
      <div className="flex items-center gap-1">
        <span className={`font-mono font-semibold ${color}`}>
          {sign}{formatGrind(entry.amount)}
        </span>
        <span className="font-mono text-parchment-grey/30">{date}</span>
      </div>
    </div>
  );
}

export function WalletHud() {
  const wallet = useGameStore((s) => s.wallet);
  const last5 = wallet.ledger.slice(0, 5);

  return (
    <div
      data-testid="wallet-hud"
      className="flex flex-col gap-1 rounded border border-ingot-gold/30 bg-obsidian/90 px-3 py-2 backdrop-blur-sm"
    >
      {/* Balance */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-ingot-gold">
          $GRIND
        </span>
        <span
          data-testid="wallet-balance"
          className="font-mono text-sm font-bold text-ingot-gold"
        >
          {formatGrind(wallet.balance)}
        </span>
      </div>

      {/* Ledger */}
      {last5.length > 0 && (
        <div className="flex flex-col divide-y divide-ingot-gold/10">
          {last5.map((e) => (
            <LedgerRow key={e.id} entry={e} />
          ))}
        </div>
      )}

      {/* Action stubs */}
      <div className="mt-1 flex gap-2">
        <button
          className="flex-1 rounded border border-gain-green/40 py-0.5 text-xs text-gain-green hover:bg-gain-green/10"
          onClick={() => {/* Sprint 6 deposit flow */}}
        >
          Deposit
        </button>
        <button
          className="flex-1 rounded border border-loss-red/40 py-0.5 text-xs text-loss-red hover:bg-loss-red/10"
          onClick={() => {/* Sprint 6 withdraw flow */}}
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}
