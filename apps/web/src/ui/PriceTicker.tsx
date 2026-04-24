export function PriceTicker() {
  return (
    <div
      data-testid="price-ticker"
      className="flex items-center gap-2 rounded border border-ingot-gold/30 bg-obsidian/80 px-3 py-1 backdrop-blur-sm"
    >
      <span className="font-mono text-xs text-parchment-grey">$GRIND</span>
      <span className="font-mono text-sm font-semibold text-ingot-gold">$0.00</span>
    </div>
  );
}
