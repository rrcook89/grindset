export function ChatDock() {
  return (
    <div className="flex w-80 flex-col rounded border border-ingot-gold/20 bg-obsidian/80 backdrop-blur-sm">
      <div className="border-b border-ingot-gold/20 px-3 py-1">
        <span className="text-xs font-medium uppercase tracking-widest text-ingot-gold/60">
          Chat
        </span>
      </div>
      <div className="h-24 overflow-y-auto px-3 py-2">
        <p className="text-xs text-parchment-grey/40">— no messages yet —</p>
      </div>
      <div className="border-t border-ingot-gold/20 px-3 py-1">
        <input
          type="text"
          placeholder="say something..."
          disabled
          className="w-full bg-transparent text-xs text-parchment-grey placeholder-parchment-grey/30 outline-none"
        />
      </div>
    </div>
  );
}
