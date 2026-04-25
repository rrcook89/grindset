import { useEffect, useRef } from "react";
import { useGameStore } from "../state/store";

// Tile-square grid; client only renders the starter zone for now.
const ZONE_TILES = 50;
const SIZE_PX = 160;
const SCALE = SIZE_PX / ZONE_TILES;

export function MiniMap() {
  const ref = useRef<HTMLCanvasElement>(null);

  // Subscribe so we re-render whenever entity positions change.
  const localPlayer = useGameStore((s) => s.localPlayer);
  const otherPlayers = useGameStore((s) => s.otherPlayers);
  const mobs = useGameStore((s) => s.mobs);
  const nodes = useGameStore((s) => s.nodes);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, SIZE_PX, SIZE_PX);

    // Border
    ctx.strokeStyle = "#3a2a10";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, SIZE_PX - 1, SIZE_PX - 1);

    // Nodes (green for skilling, gold for bank)
    for (const n of nodes.values()) {
      ctx.fillStyle = n.kind === "bank" ? "#f5c14b" : "#3bd67a";
      const x = n.x * SCALE;
      const y = n.y * SCALE;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }

    // Mobs (red dots, sized by tier)
    for (const m of mobs.values()) {
      let r = 1.5;
      if (m.maxHp >= 100) r = 3.5;
      else if (m.maxHp >= 60) r = 3;
      else if (m.maxHp >= 30) r = 2.5;
      else if (m.maxHp >= 15) r = 2;
      ctx.fillStyle = "#e04545";
      ctx.beginPath();
      ctx.arc(m.x * SCALE, m.y * SCALE, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Other players (muted gold)
    for (const p of otherPlayers.values()) {
      ctx.fillStyle = "#a07820";
      ctx.beginPath();
      ctx.arc(p.x * SCALE, p.y * SCALE, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player (bright gold + ring)
    if (localPlayer) {
      const x = localPlayer.x * SCALE;
      const y = localPlayer.y * SCALE;
      ctx.fillStyle = "#f5c14b";
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [localPlayer, otherPlayers, mobs, nodes]);

  return (
    <div className="rounded border border-ingot-gold/30 bg-obsidian/90 p-1 backdrop-blur-sm">
      <canvas ref={ref} width={SIZE_PX} height={SIZE_PX} className="block" />
    </div>
  );
}
