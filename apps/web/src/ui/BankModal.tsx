import { useRef, useState } from "react";
import { useGameStore } from "../state/store";
import type { InventoryItem } from "../net/types";

function BankSlot({
  item,
  label,
  onDragStart,
  onDrop,
  onDoubleClick,
}: {
  item: InventoryItem | undefined;
  label: string;
  onDragStart: () => void;
  onDrop: () => void;
  onDoubleClick: () => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={[
        "relative flex h-10 w-10 items-center justify-center rounded border text-[9px]",
        over ? "border-ingot-gold bg-ingot-gold/10" : "border-ingot-gold/15 bg-obsidian",
      ].join(" ")}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onDrop(); }}
      title={label}
    >
      {item ? (
        <div
          draggable
          onDragStart={onDragStart}
          onDoubleClick={onDoubleClick}
          className="h-8 w-8 cursor-grab rounded"
          style={{ backgroundColor: item.color }}
          title={item.name}
        >
          {item.quantity > 1 && (
            <span className="absolute bottom-0 right-0.5 font-mono text-[8px] text-white drop-shadow">
              {item.quantity > 9999 ? "9k+" : item.quantity}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function BankModal() {
  const bankOpen = useGameStore((s) => s.bankOpen);
  const bankItems = useGameStore((s) => s.bankItems);
  const inventory = useGameStore((s) => s.inventory);
  const setBankOpen = useGameStore((s) => s.setBankOpen);
  const depositItem = useGameStore((s) => s.depositItem);
  const withdrawItem = useGameStore((s) => s.withdrawItem);
  const moveSlot = useGameStore((s) => s.moveInventorySlot);

  const dragging = useRef<{ source: "bank" | "inv"; slot: number } | null>(null);

  if (!bankOpen) return null;

  const bankBySlot = new Map(bankItems.map((i) => [i.slotIndex, i]));
  const invBySlot = new Map(inventory.map((i) => [i.slotIndex, i]));

  const bankSlotCount = Math.max(bankItems.length + 16, 48);

  function handleDrop(dest: "bank" | "inv", destSlot: number) {
    const src = dragging.current;
    if (!src) return;
    if (src.source === "inv" && dest === "bank") {
      depositItem(src.slot);
    } else if (src.source === "bank" && dest === "inv") {
      withdrawItem(src.slot);
    } else if (src.source === "inv" && dest === "inv") {
      moveSlot(src.slot, destSlot);
    }
    dragging.current = null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-obsidian/70 backdrop-blur-sm md:items-center">
      <div className="flex w-full max-w-2xl flex-col rounded border border-ingot-gold/40 bg-obsidian shadow-2xl md:flex-row">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ingot-gold/20 px-4 py-2 md:hidden">
          <span className="text-sm font-semibold uppercase tracking-widest text-ingot-gold">Bank</span>
          <button className="text-parchment-grey/60 hover:text-ingot-gold" onClick={() => setBankOpen(false)}>
            Close
          </button>
        </div>

        {/* Bank side */}
        <div className="flex flex-1 flex-col border-r border-ingot-gold/20">
          <div className="hidden items-center justify-between border-b border-ingot-gold/20 px-4 py-2 md:flex">
            <span className="text-sm font-semibold uppercase tracking-widest text-ingot-gold">Bank</span>
            <span className="font-mono text-xs text-parchment-grey/40">{bankItems.length} items</span>
          </div>
          <div className="h-64 overflow-y-auto p-2 md:h-96">
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: bankSlotCount }, (_, i) => (
                <BankSlot
                  key={i}
                  item={bankBySlot.get(i)}
                  label={bankBySlot.get(i)?.name ?? `Bank slot ${i}`}
                  onDragStart={() => { dragging.current = { source: "bank", slot: i }; }}
                  onDrop={() => handleDrop("bank", i)}
                  onDoubleClick={() => withdrawItem(i)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Inventory side */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-ingot-gold/20 px-4 py-2">
            <span className="text-sm font-semibold uppercase tracking-widest text-ingot-gold">Inventory</span>
            <button
              className="hidden text-parchment-grey/60 hover:text-ingot-gold md:block"
              onClick={() => setBankOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="p-2">
            <div className="grid grid-cols-4 gap-1">
              {Array.from({ length: 28 }, (_, i) => (
                <BankSlot
                  key={i}
                  item={invBySlot.get(i)}
                  label={invBySlot.get(i)?.name ?? `Slot ${i}`}
                  onDragStart={() => { dragging.current = { source: "inv", slot: i }; }}
                  onDrop={() => handleDrop("inv", i)}
                  onDoubleClick={() => depositItem(i)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
