import { readFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { createHub } from '../src/hub.js';
import { parseServerMessage, type ServerMessage } from '@patch-notes-live/mod-api/protocol';
vi.mock('../src/patch/createPatch.js', () => ({
  createPatch: () => {
    throw Error('Real Codex is forbidden in tests');
  },
}));
it('streams a rule compilation over ws, re-verifies before broadcasting, attributes it and refuses a lying creator', async () => {
  const good = await readFile(
    new URL('../../../mods/samples/split-on-hit.js', import.meta.url),
    'utf8',
  );
  const bad = await readFile(
    new URL('../../../mods/samples/instant-death.js', import.meta.url),
    'utf8',
  );
  let now = 0;
  const hub = await createHub({
    port: 0,
    archive: [],
    now: () => now,
    createPatch: async (text, opts) => {
      opts.onEvent?.({ phase: 'editing', text: 'Editing.' });
      return {
        status: 'ok',
        source: text === 'bad' ? bad : good,
        attempts: 1,
        threadId: 'fake',
        durationMs: 1,
      };
    },
  });
  const socket = new WebSocket(`ws://127.0.0.1:${hub.port}`),
    events: ServerMessage[] = [];
  socket.on('message', (data) => {
    const e = parseServerMessage(data.toString());
    if (e) events.push(e);
  });
  try {
    await new Promise<void>((r) =>
      socket.on('open', () => {
        socket.send(JSON.stringify({ v: 1, type: 'hello', role: 'overlay' }));
        r();
      }),
    );
    socket.send(
      JSON.stringify({
        v: 1,
        type: 'requestPatch',
        requestId: 'good',
        text: 'split enemies',
        author: 'Judge',
      }),
    );
    await expect
      .poll(
        () =>
          events.some(
            (e) => e.type === 'patchResult' && e.requestId === 'good' && e.status === 'ok',
          ),
        { timeout: 10000 },
      )
      .toBe(true);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'compileEvent',
        phase: 'editing',
        request: 'split enemies',
        author: 'Judge',
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'applyPatch', author: 'Judge', origin: 'live' }),
    );
    now = 20001;
    socket.send(
      JSON.stringify({
        v: 1,
        type: 'requestPatch',
        requestId: 'bad',
        text: 'bad',
        author: 'Judge',
      }),
    );
    await expect
      .poll(
        () =>
          events.some(
            (e) => e.type === 'patchResult' && e.requestId === 'bad' && e.status === 'failed',
          ),
        { timeout: 10000 },
      )
      .toBe(true);
    expect(hub.patches.size).toBe(1);
  } finally {
    socket.terminate();
    await hub.close();
  }
}, 15000);
