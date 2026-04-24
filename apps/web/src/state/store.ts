import { create } from "zustand";
import type { Player, ConnectionStatus } from "../net/types";
import type { EntityPosition } from "../net/protocol";

interface GameState {
  connectionStatus: ConnectionStatus;
  localPlayer: Player | null;
  otherPlayers: Map<number, Player>;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setLocalPlayer: (player: Player) => void;
  applyPositionDelta: (entities: EntityPosition[]) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  connectionStatus: "disconnected",
  localPlayer: null,
  otherPlayers: new Map(),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setLocalPlayer: (player) => set({ localPlayer: player }),

  applyPositionDelta: (entities) => {
    const localId = get().localPlayer?.id;
    const next = new Map(get().otherPlayers);

    for (const e of entities) {
      if (e.entityId === localId) {
        set((s) => ({
          localPlayer: s.localPlayer ? { ...s.localPlayer, x: e.x, y: e.y } : s.localPlayer,
        }));
      } else {
        next.set(e.entityId, { id: e.entityId, x: e.x, y: e.y });
      }
    }

    set({ otherPlayers: new Map(next) });
  },
}));
