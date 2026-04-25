import { useState, useRef } from "react";
import { useGameStore } from "../state/store";
import type { InventoryItem } from "../net/types";
import { getActiveSocket } from "../net/Socket";
import { encodeInventoryUse } from "../net/protocol";
import { isWeapon, weaponBonus, itemSellPrice } from "../net/itemDefs";

const FOOD_HEAL: Record<string, number> = {
  fish_cooked_shrimp: 3,
  fish_cooked_trout: 7,
  fish_cooked_lobster: 12,
  fish_cooked_swordfish: 18,
};

const ITEM_LORE: Record<string, string> = {
  ore_copper: "A chunk of soft, red-streaked rock. Smelts into bronze.",
  ore_iron: "Heavy and cold. Iron's the backbone of every blade.",
  ore_coal: "Dark and dusty. Burns hot — every furnace wants it.",
  ore_mithril: "A faint blue gleam. Lighter than iron, harder than steel.",
  log_normal: "A common log. Always useful.",
  log_oak: "Solid oak. Heavier than it looks.",
  log_willow: "Pliable and quick to burn.",
  log_yew: "Aged and resilient. Bowyers prize it.",
  fish_raw_shrimp: "A raw shrimp. Cook it before you eat it.",
  fish_raw_trout: "A raw trout. Better cooked.",
  fish_raw_lobster: "A raw lobster. Cook it well.",
  fish_raw_swordfish: "A raw swordfish. Don't eat it raw.",
  rat_tail: "A fresh rat tail. Some collector wants these.",
  goblin_ear: "A goblin's ear. The eastern vendor pays fair coin.",
  coin_pouch: "A bandit's coin pouch — heavier than expected.",
  dwarven_shard: "A shard of dwarven plate. Salvageable.",
  bog_essence: "A glowing essence pulled from the bog horror's heart.",
  bronze_dagger: "A bronze dagger. +2 max hit when wielded.",
  iron_axe: "A sturdy iron axe. +4 max hit when wielded.",
  steel_sword: "A keen steel sword. +6 max hit when wielded.",
  bronze_bar: "A bronze bar. Smith it into something useful.",
  iron_bar: "An iron bar. Foundation of the warrior's kit.",
};

function describeItem(defId: string, name: string): string {
  const lore = ITEM_LORE[defId];
  const heal = FOOD_HEAL[defId];
  const wpn = weaponBonus(defId);
  const sell = itemSellPrice(defId);
  const stats: string[] = [];
  if (heal) stats.push(`heal +${heal} HP`);
  if (wpn) stats.push(`+${wpn} max hit`);
  if (sell) stats.push(`sells ${sell} \$GRIND`);
  const head = lore ?? `A ${name.toLowerCase()}.`;
  return stats.length > 0 ? `${head} (${stats.join(", ")})` : head;
}

function sellSlot(slotIndex: number): void {
  const socket = getActiveSocket();
  // target_kind=3 → vendor-sell on the server side.
  socket?.sendRaw(encodeInventoryUse(slotIndex, 3, 0));
}

function dropSlot(slotIndex: number): void {
  const socket = getActiveSocket();
  // target_kind=4 → drop (item vanishes on server).
  socket?.sendRaw(encodeInventoryUse(slotIndex, 4, 0));
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
  const [hover, setHover] = useState(false);

  const tooltipDefId = item
    ? item.name.toLowerCase().replace(/\s+/g, "_")
    : "";
  const tooltipText = item ? describeItem(tooltipDefId, item.name) : "";
  const sellPrice = item ? itemSellPrice(tooltipDefId) : 0;

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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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

      {item && hover && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-56 -translate-x-1/2 rounded border border-ingot-gold/40 bg-obsidian/95 px-2.5 py-1.5 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-ingot-gold">
            <span>{item.name}</span>
            {item.quantity > 1 && (
              <span className="font-mono text-parchment-grey/60">×{item.quantity}</span>
            )}
          </div>
          <div className="mt-1 text-[11px] leading-snug text-parchment-grey/85">
            {tooltipText}
          </div>
          {sellPrice > 0 && (
            <div className="mt-1 font-mono text-[10px] text-ingot-gold/70">
              vendor: {sellPrice} \$GRIND each
            </div>
          )}
        </div>
      )}
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
                  } else if (action === "Drop") {
                    dropSlot(ctxMenu.item.slotIndex);
                  } else if (action === "Examine") {
                    const defId = ctxMenu.item.name.toLowerCase().replace(/\s+/g, "_");
                    useGameStore.getState().addChatMessage({
                      id: `examine-${Date.now()}-${Math.random()}`,
                      channel: useGameStore.getState().chatChannel,
                      senderName: "system",
                      text: describeItem(defId, ctxMenu.item.name),
                      timestamp: Date.now(),
                    });
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
