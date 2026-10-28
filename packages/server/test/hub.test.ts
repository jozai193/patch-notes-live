import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { createHub } from '../src/hub.js';
import { liveRequest } from '../src/live-client.js';
import { parseServerMessage } from '@patch-notes-live/mod-api/protocol';
import type { ServerMessage } from '@patch-notes-live/mod-api/protocol';
const sample = async (name: string) =>
  readFile(new URL(`../../../mods/samples/${name}.js`, import.meta.url), 'utf8');

it('verifies apply, receives overlay acknowledgement and telemetry, reverts, and refuses failing source', async () => {
  const lines: string[] = [];
  const hub = await createHub({ port: 0, log: (line) => lines.push(line) });
  const url = `ws://127.0.0.1:${hub.port}`,
    overlay = new WebSocket(url);
  const messages: ServerMessage[] = [];
  overlay.on('message', (data) => {
    const message = parseServerMessage(data.toString());
    if (message) messages.push(message);
  });
  overlay.on('error', () => {});
  try {
    await new Promise<void>((resolve) =>
      overlay.on('open', () => {
        overlay.send(JSON.stringify({ v: 1, type: 'hello', role: 'overlay' }));
        resolve();
      }),
    );
    const applied = await liveRequest(
      { type: 'applyRequest', source: await sample('split-on-hit'), author: 'tester' },
      url,
    );
    expect(applied.ok).toBe(true);
    expect(applied.patchId).toBeTypeOf('string');
    await expect
      .poll(() => messages.some((m) => m.type === 'applyPatch' && m.patchId === applied.patchId))
      .toBe(true);
    overlay.send(
      JSON.stringify({ v: 1, type: 'patchApplied', patchId: applied.patchId, version: 'v1.1' }),
    );
    overlay.send(
      JSON.stringify({
        v: 1,
        type: 'telemetry',
        fps: 60,
        frameP95: 17,
        sandboxP95: 0.5,
        activePatches: [],
      }),
    );
    await expect.poll(() => lines.some((line) => line.includes('patchApplied'))).toBe(true);
    await expect.poll(() => hub.telemetry.size).toBe(1);
    const reverted = await liveRequest({ type: 'revertRequest', patchId: applied.patchId! }, url);
    expect(reverted.ok).toBe(true);
    await expect
      .poll(() => messages.some((m) => m.type === 'revertPatch' && m.patchId === applied.patchId))
      .toBe(true);
    const refused = await liveRequest(
      { type: 'applyRequest', source: await sample('instant-death'), author: 'tester' },
      url,
    );
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('winnable');
    expect(hub.patches.size).toBe(0);
  } finally {
    overlay.terminate();
    await hub.close();
  }
}, 20000);

it('expires the oldest server patch on a fourth apply and sends reconnect snapshots', async () => {
  const hub = await createHub({ port: 0 }),
    url = `ws://127.0.0.1:${hub.port}`;
  try {
    const source = await sample('enemies-tiny-and-fast');
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await liveRequest({ type: 'applyRequest', source, author: 'tester' }, url);
      expect(result.ok).toBe(true);
      ids.push(result.patchId!);
    }
    expect([...hub.patches.keys()]).toEqual(ids.slice(1));
    const socket = new WebSocket(url);
    const hello = await new Promise<ServerMessage>((resolve) => {
      socket.on('open', () =>
        socket.send(JSON.stringify({ v: 1, type: 'hello', role: 'overlay' })),
      );
      socket.on('message', (data) => {
        const message = parseServerMessage(data.toString());
        if (message) resolve(message);
      });
    });
    expect(hello).toMatchObject({ type: 'hello', patches: expect.any(Array) });
    socket.terminate();
  } finally {
    await hub.close();
  }
}, 20000);
