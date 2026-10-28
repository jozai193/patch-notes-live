import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { parseServerMessage } from '@patch-notes-live/mod-api/protocol';
import type { ClientMessage } from '@patch-notes-live/mod-api/protocol';

type Request =
  | { type: 'applyRequest'; source: string; author: string }
  | { type: 'revertRequest'; patchId: string };
export function liveRequest(
  request: Request,
  url = process.env.PATCH_SERVER_URL || `ws://127.0.0.1:${process.env.PORT || 8787}`,
): Promise<Extract<ReturnType<typeof parseServerMessage>, { type: 'result' }>> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url),
      requestId = randomUUID();
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('Hub request timed out'));
    }, 30_000);
    const fail = (error: Error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    };
    socket.on('error', fail);
    socket.on('open', () => {
      socket.send(
        JSON.stringify({ v: 1, type: 'hello', role: 'controller' } satisfies ClientMessage),
      );
      socket.send(JSON.stringify({ v: 1, requestId, ...request } satisfies ClientMessage));
    });
    socket.on('message', (data) => {
      const message = parseServerMessage(data.toString());
      if (message?.type !== 'result' || message.requestId !== requestId) return;
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      reject(new Error('Hub connection closed before result'));
    });
  });
}
