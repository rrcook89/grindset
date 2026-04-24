import { useRef, useState, useEffect } from "react";
import { useGameStore } from "../state/store";
import type { ChatChannel } from "../net/types";

const CHANNELS: ChatChannel[] = ["global", "zone", "guild", "trade"];

const CHANNEL_COLOR: Record<ChatChannel, string> = {
  global: "text-parchment-grey",
  zone: "text-gain-green",
  guild: "text-arcane-violet",
  trade: "text-ingot-gold",
};

export function ChatDock() {
  const chat = useGameStore((s) => s.chat);
  const chatChannel = useGameStore((s) => s.chatChannel);
  const setChatChannel = useGameStore((s) => s.setChatChannel);
  const addChatMessage = useGameStore((s) => s.addChatMessage);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep scroll pinned to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const visible = chat.filter((m) => m.channel === chatChannel || chatChannel === "global");

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    // Optimistic local echo; server will broadcast back via WS
    addChatMessage({
      id: `local-${Date.now()}`,
      channel: chatChannel,
      senderName: "You",
      text,
      timestamp: Date.now(),
    });
    // TODO Sprint 6: send via socket.sendRaw(encodeChatSend(...))
    setInput("");
  }

  return (
    <div className="flex w-72 flex-col rounded border border-ingot-gold/20 bg-obsidian/90 backdrop-blur-sm md:w-80">
      {/* Channel tabs */}
      <div className="flex border-b border-ingot-gold/20">
        {CHANNELS.map((ch) => (
          <button
            key={ch}
            className={[
              "flex-1 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors",
              chatChannel === ch
                ? "bg-ingot-gold/10 text-ingot-gold"
                : "text-parchment-grey/40 hover:text-parchment-grey/70",
            ].join(" ")}
            onClick={() => setChatChannel(ch)}
          >
            {ch}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="h-28 overflow-y-auto px-2 py-1 text-xs">
        {visible.length === 0 ? (
          <p className="text-parchment-grey/30">— no messages —</p>
        ) : (
          visible.slice(-50).map((msg) => (
            <p key={msg.id} className="leading-5">
              <span className="font-semibold text-ingot-gold/80">{msg.senderName}: </span>
              <span className={CHANNEL_COLOR[msg.channel]}>{msg.text}</span>
            </p>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t border-ingot-gold/20 px-2 py-1">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          maxLength={200}
          placeholder="say something..."
          className="w-full bg-transparent text-xs text-parchment-grey placeholder-parchment-grey/30 outline-none"
        />
      </div>
    </div>
  );
}
