const SLOTS = 8;

export function Hotbar() {
  return (
    <div className="flex gap-1 rounded border border-ingot-gold/20 bg-obsidian/80 p-1 backdrop-blur-sm">
      {Array.from({ length: SLOTS }, (_, i) => (
        <div
          key={i}
          className="flex h-12 w-12 items-center justify-center rounded border border-ingot-gold/20 bg-obsidian"
        >
          <span className="text-xs text-parchment-grey/20">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
