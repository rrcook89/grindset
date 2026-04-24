import {
  OP,
  encodeHello,
  decodeWelcome,
  decodePositionDelta,
  decodeError,
  readOpcode,
} from "./protocol";
import { useGameStore } from "../state/store";

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 10;

export class GameSocket {
  private ws: WebSocket | null = null;
  private devUser: string;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private destroyed = false;

  constructor(wsUrl: string, devUser: string) {
    this.wsUrl = wsUrl;
    this.devUser = devUser;
  }

  connect(): void {
    const url = `${this.wsUrl}?dev_user=${encodeURIComponent(this.devUser)}`;
    useGameStore.getState().setConnectionStatus("connecting");

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      ws.send(encodeHello(this.devUser));
    };

    ws.onmessage = (evt: MessageEvent<ArrayBuffer>) => {
      this.handleMessage(evt.data);
    };

    ws.onerror = () => {
      useGameStore.getState().setConnectionStatus("error");
    };

    ws.onclose = () => {
      if (this.destroyed) return;
      useGameStore.getState().setConnectionStatus("disconnected");
      this.scheduleReconnect();
    };
  }

  private handleMessage(buf: ArrayBuffer): void {
    const opcode = readOpcode(buf);
    const store = useGameStore.getState();

    switch (opcode) {
      case OP.WELCOME: {
        const payload = decodeWelcome(buf);
        store.setConnectionStatus("connected");
        store.setLocalPlayer({
          id: payload.playerId,
          x: payload.spawnX,
          y: payload.spawnY,
        });
        break;
      }
      case OP.POSITION_DELTA: {
        const payload = decodePositionDelta(buf);
        store.applyPositionDelta(payload.entities);
        break;
      }
      case OP.ERROR: {
        const payload = decodeError(buf);
        console.error(`[GRINDSET] Server error ${payload.code}: ${payload.message}`);
        break;
      }
      default:
        break;
    }
  }

  sendRaw(data: Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    this.reconnectAttempts++;
    setTimeout(() => {
      if (!this.destroyed) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  destroy(): void {
    this.destroyed = true;
    this.ws?.close();
    this.ws = null;
  }
}
