import { randomUUID } from 'node:crypto';
import { loadArchive } from './archive.js';
import { RuleQueue, type PatchCreator } from './rule-queue.js';
import type { ArchivedMod } from '@patch-notes-live/mod-api/archive';
import WebSocket, { WebSocketServer } from 'ws';
import { verify } from '@patch-notes-live/harness';
import { SandboxHost } from '@patch-notes-live/mod-api';
import { parseClientMessage } from '@patch-notes-live/mod-api/protocol';
import type { ClientMessage, Patch, ServerMessage } from '@patch-notes-live/mod-api/protocol';

const clean = (text: string, max: number) =>
  text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .trim()
    .slice(0, max);
export async function createHub(
  options: {
    port?: number;
    log?: (text: string) => void;
    createPatch?: PatchCreator;
    archive?: readonly ArchivedMod[];
    now?: () => number;
  } = {},
) {
  const port = options.port ?? Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('PORT must be an integer from 0 to 65535');
  const cachedArchive = options.archive ?? (await loadArchive());
  const wss = new WebSocketServer({ host: '127.0.0.1', port, maxPayload: 65536 });
  const roles = new Map<WebSocket, 'overlay' | 'controller'>();
  const patches = new Map<string, Patch>();
  const telemetry = new Map<WebSocket, Extract<ClientMessage, { type: 'telemetry' }>>();
  const log = options.log ?? (() => {});
  let queue = Promise.resolve(),
    queued = 0,
    closed = false;
  const signal = new AbortController();
  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcast = (message: ServerMessage) => {
    for (const [socket, role] of roles) if (role === 'overlay') send(socket, message);
  };
  const revert = (patchId: string, reason: string) => {
    if (!patches.delete(patchId)) return false;
    broadcast({ v: 1, type: 'revertPatch', patchId, reason });
    log(`revertPatch ${patchId}: ${reason}`);
    return true;
  };
  async function publish(
    source: string,
    author: string,
    origin: 'live' | 'archive',
  ): Promise<Patch> {
    const result = await verify(source, { signal: signal.signal });
    if (!result.ok) {
      const failure = result.checks.find((c) => !c.ok)!;
      throw Error(clean(`${failure.id}: ${failure.detail}`, 512));
    }
    const host = await SandboxHost.create([source]);
    let patch: Patch;
    try {
      const mod = host.mods[0]!;
      patch = {
        patchId: randomUUID(),
        name: clean(mod.name, 100) || 'Untitled patch',
        description: clean(mod.description, 500),
        ...(mod.patchNotes === undefined ? {} : { patchNotes: mod.patchNotes }),
        author,
        source,
        origin,
      };
    } finally {
      host.dispose();
    }
    if (closed) throw Error('Hub is stopping.');
    if (patches.size >= 3) revert(patches.keys().next().value!, 'expired');
    patches.set(patch.patchId, patch);
    broadcast({ v: 1, type: 'applyPatch', ...patch });
    log(
      `applyPatch ${patch.patchId}: ${patch.name} by ${author}; independently verified; ${origin}`,
    );
    return patch;
  }
  async function apply(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: 'applyRequest' }>,
  ) {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    const patch = await publish(message.source, message.author, 'live');
    send(socket, {
      v: 1,
      type: 'result',
      requestId: message.requestId,
      ok: true,
      patchId: patch.patchId,
    });
  }
  const rules = new RuleQueue<WebSocket>({
    send,
    broadcast,
    archive: cachedArchive,
    apply: async (source, author, origin) => {
      await publish(source, author, origin);
    },
    ...(options.createPatch ? { create: options.createPatch } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  wss.on('connection', (socket) => {
    socket.on('error', (error) => log(`WebSocket error: ${error.message}`));
    socket.on('close', () => {
      roles.delete(socket);
      telemetry.delete(socket);
    });
    socket.on('message', (data, binary) => {
      const message = binary ? undefined : parseClientMessage(data.toString());
      if (!message) {
        socket.close(1008, 'Invalid protocol message');
        return;
      }
      if (message.type === 'hello') {
        if (roles.has(socket)) {
          socket.close(1008, 'Already identified');
          return;
        }
        roles.set(socket, message.role);
        send(socket, {
          v: 1,
          type: 'hello',
          patches: message.role === 'overlay' ? [...patches.values()] : [],
        });
        return;
      }
      const role = roles.get(socket);
      if (role === 'overlay') {
        if (message.type === 'requestPatch') rules.submit(socket, message);
        else if (message.type === 'patchApplied')
          log(`patchApplied ${message.patchId} ${message.version}`);
        else if (message.type === 'patchReverted') revert(message.patchId, message.reason);
        else if (message.type === 'telemetry') telemetry.set(socket, message);
        else socket.close(1008, 'Overlay role required');
      } else if (role === 'controller') {
        if (message.type === 'revertRequest') {
          const ok = revert(message.patchId, 'manual');
          send(socket, {
            v: 1,
            type: 'result',
            requestId: message.requestId,
            ok,
            ...(ok ? { patchId: message.patchId } : { reason: 'Unknown patch ID' }),
          });
        } else if (message.type === 'applyRequest') {
          if (queued >= 8) {
            send(socket, {
              v: 1,
              type: 'result',
              requestId: message.requestId,
              ok: false,
              reason: 'Verification queue is full',
            });
            return;
          }
          queued++;
          queue = queue
            .then(() => apply(socket, message))
            .catch((error) => {
              send(socket, {
                v: 1,
                type: 'result',
                requestId: message.requestId,
                ok: false,
                reason: clean(error instanceof Error ? error.message : 'Verification error', 512),
              });
            })
            .finally(() => {
              queued--;
            });
        } else socket.close(1008, 'Controller role required');
      } else socket.close(1008, 'Send hello first');
    });
  });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  wss.on('error', (error) => log(`Hub error: ${error.message}`));
  const address = wss.address();
  const actualPort = address && typeof address !== 'string' ? address.port : port;
  return {
    port: actualPort,
    patches,
    telemetry,
    async close() {
      closed = true;
      signal.abort();
      await rules.close();
      for (const socket of wss.clients) socket.terminate();
      await queue;
      await new Promise<void>((resolve, reject) =>
        wss.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
