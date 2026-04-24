import { useState } from "react";
import { useGameStore } from "../state/store";
import { formatGrind } from "./WalletHud";
import type { OrderSide } from "../net/types";

type Tab = "buy" | "sell" | "orders";

function OrderRow({ itemName, qty, filled, price, side, onCancel }: {
  itemName: string;
  qty: number;
  filled: number;
  price: number;
  side: OrderSide;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-ingot-gold/10 py-1.5 text-xs">
      <div className="flex flex-col">
        <span className="font-semibold text-parchment-grey">{itemName}</span>
        <span className="text-parchment-grey/50">
          {filled}/{qty} filled · {formatGrind(BigInt(price))} ea
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={side === "buy" ? "text-gain-green" : "text-loss-red"}>
          {side.toUpperCase()}
        </span>
        <button
          className="rounded border border-loss-red/40 px-2 py-0.5 text-loss-red hover:bg-loss-red/10"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function GrandBazaar() {
  const geOpen = useGameStore((s) => s.geOpen);
  const geOrders = useGameStore((s) => s.geOrders);
  const setGEOpen = useGameStore((s) => s.setGEOpen);
  const setGEOrders = useGameStore((s) => s.setGEOrders);

  const [tab, setTab] = useState<Tab>("buy");
  const [search, setSearch] = useState("");
  const [itemName, setItemName] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  if (!geOpen) return null;

  function handleSubmit(side: OrderSide) {
    const qtyNum = parseInt(qty, 10);
    const priceNum = parseInt(price, 10);
    if (!itemName.trim()) { setFormError("Item name required"); return; }
    if (!Number.isFinite(qtyNum) || qtyNum < 1) { setFormError("Qty must be ≥ 1"); return; }
    if (!Number.isFinite(priceNum) || priceNum < 1) { setFormError("Price must be ≥ 1"); return; }
    setFormError(null);
    // Optimistic local order (server will confirm/update via WS)
    const order = {
      id: `local-${Date.now()}`,
      side,
      itemId: 0,
      itemName: itemName.trim(),
      quantity: qtyNum,
      filledQty: 0,
      priceEach: priceNum,
      timestamp: Date.now(),
    };
    setGEOrders([order, ...geOrders]);
    setItemName(""); setQty(""); setPrice(""); setTab("orders");
  }

  function cancelOrder(id: string) {
    setGEOrders(geOrders.filter((o) => o.id !== id));
    // TODO: send encodeGEOrderCancel via socket
  }

  const filtered = search
    ? geOrders.filter((o) => o.itemName.toLowerCase().includes(search.toLowerCase()))
    : geOrders;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-obsidian/70 backdrop-blur-sm md:items-center">
      <div className="flex w-full max-w-md flex-col rounded-t border border-ingot-gold/40 bg-obsidian shadow-2xl md:rounded">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ingot-gold/20 px-4 py-2">
          <span className="text-sm font-semibold uppercase tracking-widest text-ingot-gold">
            Grand Bazaar
          </span>
          <button className="text-parchment-grey/60 hover:text-ingot-gold" onClick={() => setGEOpen(false)}>
            Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ingot-gold/20">
          {(["buy", "sell", "orders"] as Tab[]).map((t) => (
            <button
              key={t}
              className={[
                "flex-1 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors",
                tab === t ? "bg-ingot-gold/10 text-ingot-gold" : "text-parchment-grey/40 hover:text-parchment-grey/70",
              ].join(" ")}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 p-4">
          {(tab === "buy" || tab === "sell") && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-xs text-parchment-grey/60">Item</label>
                <input
                  data-testid="ge-item-input"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Iron Ore"
                  className="rounded border border-ingot-gold/20 bg-obsidian px-3 py-1.5 text-sm text-parchment-grey placeholder-parchment-grey/30 outline-none focus:border-ingot-gold/50"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-2">
                  <label className="text-xs text-parchment-grey/60">Quantity</label>
                  <input
                    data-testid="ge-qty-input"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="1"
                    className="rounded border border-ingot-gold/20 bg-obsidian px-3 py-1.5 font-mono text-sm text-parchment-grey placeholder-parchment-grey/30 outline-none focus:border-ingot-gold/50"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  <label className="text-xs text-parchment-grey/60">Price ea ($GRIND base)</label>
                  <input
                    data-testid="ge-price-input"
                    type="number"
                    min={1}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="100"
                    className="rounded border border-ingot-gold/20 bg-obsidian px-3 py-1.5 font-mono text-sm text-parchment-grey placeholder-parchment-grey/30 outline-none focus:border-ingot-gold/50"
                  />
                </div>
              </div>

              {formError && (
                <p data-testid="ge-error" className="text-xs text-loss-red">{formError}</p>
              )}

              {/* Depth chart placeholder */}
              <div className="flex h-16 items-center justify-center rounded border border-ingot-gold/10 bg-obsidian/50">
                <span className="text-xs text-parchment-grey/30">Depth chart — coming Sprint 4</span>
              </div>

              <button
                data-testid="ge-submit"
                className={[
                  "w-full rounded border py-2 text-sm font-semibold uppercase tracking-widest transition-colors",
                  tab === "buy"
                    ? "border-gain-green/40 text-gain-green hover:bg-gain-green/10"
                    : "border-loss-red/40 text-loss-red hover:bg-loss-red/10",
                ].join(" ")}
                onClick={() => handleSubmit(tab)}
              >
                Place {tab} order
              </button>
            </>
          )}

          {tab === "orders" && (
            <>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter orders..."
                className="rounded border border-ingot-gold/20 bg-obsidian px-3 py-1.5 text-sm text-parchment-grey placeholder-parchment-grey/30 outline-none focus:border-ingot-gold/50"
              />
              <div className="max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="text-xs text-parchment-grey/30">No active orders</p>
                ) : (
                  filtered.map((o) => (
                    <OrderRow
                      key={o.id}
                      itemName={o.itemName}
                      qty={o.quantity}
                      filled={o.filledQty}
                      price={o.priceEach}
                      side={o.side}
                      onCancel={() => cancelOrder(o.id)}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
