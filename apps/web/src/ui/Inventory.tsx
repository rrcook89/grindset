import { useState, useRef } from "react";
import { useGameStore } from "../state/store";
import type { InventoryItem } from "../net/types";
import { getActiveSocket } from "../net/Socket";
import { encodeInventoryUse } from "../net/protocol";
import { isWeapon, weaponBonus, itemSellPrice } from "../net/itemDefs";

function sellSlot(slotIndex: number): void {
  const socket = getActiveSocket();
  // target_kind=3 → vendor-sell on the server side.
  socket?.sendRaw(encodeInventoryUse(slotIndex, 3, 0));
}

function useSlot(slotIndex: number, item?: InventoryItem): void {
  const socket = getActiveSocket();
  socket?.sendRaw(encodeInventoryUse(slotIndex, 0, 0));
  // Optimistic equipped-weapon prediction: server is authoritative for the
  // damage roll, but the UI label tracks the most recent intent.
  if (item) {
    // The item.name is "Bronze dagger" etc.; we need the defID. Map back
    // from the small weapons table.
    const inferredDefId = item.name.toLowerCase().replace(/\s+/g, "_");
    if (isWeapon(inferredDefId)) {
      const cur = useGameStore.getState().equippedWeapon;
      // Toggle-swap: if you click the same item, server returns the previous
      // weapon to the slot, so we swap. Otherwise it's the new equipped.
      useGameStore.getState().setEquippedWeapon(cur === inferredDefId ? null : inferredDefId);
    }
  }
}

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
          onDoubleClick={() => useSlot(item.slotIndex, item)}
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
  const equippedWeapon = useGameStore((s) => s.equippedWeapon);
  const moveSlot = useGameStore((s) => s.moveInventorySlot);
  const dragSlot = useRef<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu>(null);

  const itemBySlot = new Map(inventory.map((i) => [i.slotIndex, i]));
  const weaponLabel = equippedWeapon
    ? equippedWeapon.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "unarmed";
  const weaponBonusValue = weaponBonus(equippedWeapon);

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
      <div className="mb-1 flex items-center justify-between border-b border-ingot-gold/15 pb-1 text-[10px] uppercase tracking-widest">
        <span className="text-parchment-grey/60">Wielding</span>
        <span className={equippedWeapon ? "text-ingot-gold" : "text-parchment-grey/40"}>
          {weaponLabel}
          {weaponBonusValue > 0 && (
            <span className="ml-1 font-mono text-loss-red">+{weaponBonusValue}</span>
          )}
        </span>
      </div>
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

      {ctxMenu && (() => {
        const ctxItemDefId = ctxMenu.item.name.toLowerCase().replace(/\s+/g, "_");
        const sellPrice = itemSellPrice(ctxItemDefId);
        const actions: Array<"Use" | "Examine" | "Drop" | "Deposit" | "Sell"> = ["Use", "Examine", "Drop", "Deposit"];
        if (sellPrice > 0) actions.push("Sell");
        return (
          <div
            className="fixed z-50 rounded border border-ingot-gold/40 bg-obsidian py-1 shadow-lg"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {actions.map((action) => (
              <button
                key={action}
                className="block w-full px-4 py-1 text-left text-sm text-parchment-grey hover:bg-ingot-gold/10 hover:text-ingot-gold"
                onClick={() => {
                  if (action === "Deposit") {
                    useGameStore.getState().depositItem(ctxMenu.item.slotIndex);
                  } else if (action === "Use") {
                    useSlot(ctxMenu.item.slotIndex, ctxMenu.item);
                  } else if (action === "Sell") {
                    sellSlot(ctxMenu.item.slotIndex);
                  }
                  setCtxMenu(null);
                }}
              >
                {action}
                {action === "Sell" && (
                  <span className="ml-2 font-mono text-xs text-ingot-gold/60">
                    {sellPrice}× {ctxMenu.item.quantity > 1 ? `(${sellPrice * ctxMenu.item.quantity} total)` : "$GRIND"}
                  </span>
                )}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
