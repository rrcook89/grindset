export interface Player {
  id: number;
  x: number;
  y: number;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
