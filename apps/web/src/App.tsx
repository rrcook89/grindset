import { useEffect, useRef } from "react";
import { Game } from "./game/Game";
import { GameSocket } from "./net/Socket";
import { UIShell } from "./ui/UIShell";

const WS_URL = import.meta.env.VITE_GAME_WS_URL ?? "ws://localhost:8080/ws";
// Per-tab unique dev user so two tabs (or a StrictMode double-mount) never
// collide on the server's "bump existing" rule. Sprint 2 will replace this
// with a JWT issued by the magic-link flow.
const DEV_USER = `player_${Math.random().toString(36).slice(2, 8)}`;

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;
    const socket = new GameSocket(WS_URL, DEV_USER);

    Game.create(canvasRef.current, socket).then((game) => {
      if (cancelled) {
        // Effect was cleaned up before Pixi finished initialising.
        // Tear down the orphaned instances instead of leaking a WebGL context.
        game.destroy();
        socket.destroy();
        return;
      }
      gameRef.current = game;
      socketRef.current = socket;
      socket.connect();
    });

    return () => {
      cancelled = true;
      socketRef.current?.destroy();
      gameRef.current?.destroy();
      socketRef.current = null;
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-obsidian">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {/* Vignette overlay — radial gradient that darkens screen corners,
          giving focus to the centre where the player sits. Pure CSS, sits
          above canvas but below interactive UI via pointer-events:none. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      <UIShell />
    </div>
  );
}
