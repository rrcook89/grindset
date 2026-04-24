import { useEffect, useRef } from "react";
import { Game } from "./game/Game";
import { GameSocket } from "./net/Socket";
import { UIShell } from "./ui/UIShell";

const WS_URL = import.meta.env.VITE_GAME_WS_URL ?? "ws://localhost:8080/ws";
// Default dev user; Sprint 2 will replace with real auth
const DEV_USER = "player1";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (gameRef.current) return; // StrictMode double-invoke guard

    const socket = new GameSocket(WS_URL, DEV_USER);
    socketRef.current = socket;

    Game.create(canvasRef.current, socket).then((game) => {
      gameRef.current = game;
      socket.connect();
    });

    return () => {
      socketRef.current?.destroy();
      gameRef.current?.destroy();
      socketRef.current = null;
      gameRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-obsidian">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <UIShell />
    </div>
  );
}
