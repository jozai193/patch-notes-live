import { parseServerMessage } from '@patch-notes-live/mod-api/protocol';
import type { ClientMessage, ServerMessage } from '@patch-notes-live/mod-api/protocol';

export const reconnectDelay = (attempt: number) =>
  Math.min(10_000, 500 * 2 ** Math.min(attempt, 5));
export class HubConnection {
  private socket: WebSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private closed = false;
  constructor(
    private readonly url: string,
    private readonly receive: (message: ServerMessage) => void,
    private readonly status: (connected: boolean) => void,
  ) {
    this.connect();
  }
  private connect(): void {
    if (this.closed) return;
    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.retry();
      return;
    }
    const socket = this.socket;
    socket.addEventListener('open', () => {
      this.attempt = 0;
      this.status(true);
      this.send({ v: 1, type: 'hello', role: 'overlay' });
    });
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const message = parseServerMessage(event.data);
      if (message) this.receive(message);
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => {
      this.status(false);
      this.retry();
    });
  }
  private retry(): void {
    if (!this.closed) this.timer = setTimeout(() => this.connect(), reconnectDelay(this.attempt++));
  }
  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.socket?.close();
  }
}
