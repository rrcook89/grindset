import { useRef, useState, useEffect } from "react";
import { useGameStore } from "../state/store";
import type { ChatChannel } from "../net/types";
import { getActiveSocket } from "../net/Socket";
import { encodeChatSend } from "../net/protocol";

const CHANNELS: ChatChannel[] = ["global", "zone", "guild", "trade"];

const CHANNEL_INDEX: Record<ChatChannel, number> = {
  global: 0,
  zone: 1,
  guild: 2,
  trade: 3,
};

const HELP_TEXT = [
  "/me <action>  — emote in italics",
  "/clear        — clear chat history",
  "/help         — show commands",
  "/level        — show your highest skill",
].join("\n");

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

  function localEcho(text: string, sender = "You") {
    addChatMessage({
      id: `local-${Date.now()}-${Math.random()}`,
      channel: chatChannel,
      senderName: sender,
      text,
      timestamp: Date.now(),
    });
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    // Slash-commands: handled entirely client-side, never broadcast.
    if (text.startsWith("/")) {
      const [cmd, ...rest] = text.split(/\s+/);
      const arg = rest.join(" ");
      switch (cmd) {
        case "/me":
          if (arg) localEcho(`* ${arg} *`, "You");
          break;
        case "/clear":
          useGameStore.setState({ chat: [] });
          break;
        case "/help":
          for (const line of HELP_TEXT.split("\n")) localEcho(line, "system");
          break;
        case "/level": {
          const skills = useGameStore.getState().skills;
          const top = [...skills].sort((a, b) => b.level - a.level)[0];
          if (top) localEcho(`Highest: ${top.name} L${top.level} (${top.xp.toLocaleString()} XP)`, "system");
          break;
        }
        default:
          localEcho(`unknown command: ${cmd}`, "system");
      }
      setInput("");
      return;
    }

    // Real chat: send to server, optimistic local echo so the user sees
    // their own message immediately. Server broadcast will arrive via WS.
    const socket = getActiveSocket();
    if (socket) {
      socket.sendRaw(encodeChatSend(CHANNEL_INDEX[chatChannel], text));
    }
    localEcho(text);
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
