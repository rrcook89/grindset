import { useState, useRef } from "react";
import { useGameStore } from "../state/store";
import type { InventoryItem } from "../net/types";

const TOTAL_SLOTS = 28;
const COLS = 4;
const ROWS = 7;

type ContextMenu = { x: number; y: number; item: InventoryItem } | null;

function ItemSlot({
  item,
  slotIndex,
  onDragStart,
  onDrop,
  onContextMenu,
}: {
  item: InventoryItem | undefined;
  slotIndex: number;
  onDragStart: (slotIndex: number) => void;
  onDrop: (toSlot: number) => void;
  onContextMenu: (e: React.MouseEvent, item: InventoryItem) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      data-testid={`inv-slot-${slotIndex}`}
      className={[
        "relative flex h-12 w-12 items-center justify-center rounded border",
        dragOver
          ? "border-ingot-gold bg-ingot-gold/10"
          : "border-ingot-gold/20 bg-obsidian",
      ].join(" ")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDrop(slotIndex);
      }}
    >
      {item ? (
        <div
          draggable
          onDragStart={() => onDragStart(item.slotIndex)}
          onContextMenu={(e) => onContextMenu(e, item)}
          className="flex h-10 w-10 cursor-grab items-center justify-center rounded"
          style={{ backgroundColor: item.color }}
          title={item.name}
        >
          {item.quantity > 1 && (
            <span className="absolute bottom-0.5 right-0.5 font-mono text-[9px] leading-none text-white drop-shadow">
              {item.quantity > 999 ? "999+" : item.quantity}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Inventory() {
  const inventory = useGameStore((s) => s.inventory);
  const moveSlot = useGameStore((s) => s.moveInventorySlot);
  const dragSlot = useRef<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu>(null);

  const itemBySlot = new Map(inventory.map((i) => [i.slotIndex, i]));

  function handleDragStart(slotIndex: number) {
    dragSlot.current = slotIndex;
  }

  function handleDrop(toSlot: number) {
    if (dragSlot.current !== null && dragSlot.current !== toSlot) {
      moveSlot(dragSlot.current, toSlot);
    }
    dragSlot.current = null;
  }

  function handleContextMenu(e: React.MouseEvent, item: InventoryItem) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }

  const slots = Array.from({ length: TOTAL_SLOTS }, (_, i) => i);

  return (
    <div
      className="relative select-none rounded border border-ingot-gold/30 bg-obsidian/90 p-2"
      onClick={() => setCtxMenu(null)}
    >
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${COLS}, 3rem)`, gridTemplateRows: `repeat(${ROWS}, 3rem)` }}
      >
        {slots.map((i) => (
          <ItemSlot
            key={i}
            slotIndex={i}
            item={itemBySlot.get(i)}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>

      {ctxMenu && (
        <div
          className="fixed z-50 rounded border border-ingot-gold/40 bg-obsidian py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {(["Use", "Examine", "Drop", "Deposit"] as const).map((action) => (
            <button
              key={action}
              className="block w-full px-4 py-1 text-left text-sm text-parchment-grey hover:bg-ingot-gold/10 hover:text-ingot-gold"
              onClick={() => {
                if (action === "Deposit") {
                  useGameStore.getState().depositItem(ctxMenu.item.slotIndex);
                }
                setCtxMenu(null);
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
