import { expect, it, vi } from 'vitest';
import type { ServerMessage } from '@patch-notes-live/mod-api/protocol';
import type { ArchivedMod } from '@patch-notes-live/mod-api/archive';
import type { PatchResult } from '../src/patch/types.js';
import { RuleQueue, type PatchCreator } from '../src/rule-queue.js';
vi.mock('../src/patch/createPatch.js', () => ({
  createPatch: () => {
    throw Error('Real Codex is forbidden in tests');
  },
}));
const result = (status: PatchResult['status']): PatchResult => ({
  status,
  source: 'source',
  reason: 'reason',
  attempts: 1,
  threadId: 'fake',
  durationMs: 1,
});
const request = (id: string, text = 'make the player huge') => ({
  v: 1 as const,
  type: 'requestPatch' as const,
  requestId: id,
  text,
  author: 'You',
});
const cached: ArchivedMod = {
  change: 'add',
  file: 'huge.js',
  name: 'Huge player',
  request: 'make the player huge',
  tags: ['huge'],
  patchNotes: 'Big.',
  source: 'archived',
};
it('runs one compilation at a time, bounds three waiting, and enforces the client cooldown', async () => {
  const events: ServerMessage[] = [];
  const releases: (() => void)[] = [];
  let calls = 0,
    active = 0,
    maxActive = 0,
    clock = 0;
  const create: PatchCreator = async () => {
    calls++;
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise<void>((r) => releases.push(r));
    active--;
    return result('ok');
  };
  const queue = new RuleQueue({
    send: (_c, e) => events.push(e),
    broadcast: (e) => events.push(e),
    apply: async () => {},
    archive: [],
    create,
    now: () => clock,
  });
  const client = {};
  queue.submit(client, request('first'));
  await vi.waitFor(() => expect(calls).toBe(1));
  queue.submit(client, request('cooldown'));
  for (let i = 0; i < 4; i++) queue.submit({}, request('waiting-' + i));
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'patchResult',
      requestId: 'cooldown',
      reason: expect.stringContaining('20 seconds'),
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'patchResult',
      requestId: 'waiting-3',
      reason: expect.stringContaining('queue is full'),
    }),
  );
  for (let i = 0; i < 4; i++) {
    releases.shift()!();
    if (i < 3) await vi.waitFor(() => expect(calls).toBe(i + 2));
  }
  await vi.waitFor(() =>
    expect(events.filter((e) => e.type === 'patchResult' && e.status === 'ok')).toHaveLength(4),
  );
  expect(maxActive).toBe(1);
  clock = 20001;
  queue.submit(client, request('again'));
  await vi.waitFor(() => expect(calls).toBe(5));
  releases.shift()!();
  await queue.close();
});
it('applies attributed live sources after independent checks and falls back honestly only on quota', async () => {
  for (const status of ['ok', 'quota', 'failed', 'rejected', 'timeout'] as const) {
    const events: ServerMessage[] = [];
    const applied: string[][] = [];
    const queue = new RuleQueue({
      send: (_c, e) => events.push(e),
      broadcast: (e) => events.push(e),
      apply: async (s, a, o) => {
        applied.push([s, a, o]);
      },
      archive: [cached],
      create: async (_r, options) => {
        options.onEvent?.({ phase: 'editing', text: 'Editing.' });
        return result(status);
      },
    });
    queue.submit({}, request('r'));
    await vi.waitFor(() => expect(events.some((e) => e.type === 'patchResult')).toBe(true));
    await queue.close();
    expect(applied).toEqual(
      status === 'ok'
        ? [['source', 'You', 'live']]
        : status === 'quota'
          ? [['archived', 'You', 'archive']]
          : [],
    );
    const outcome = events.find((e) => e.type === 'patchResult');
    expect(outcome).toMatchObject({ status, archived: status === 'quota' });
    if (status === 'quota')
      expect(outcome).toHaveProperty(
        'reason',
        'Codex is out of quota — loaded a patch from the archive',
      );
  }
});
it('refuses blocklisted input, unmatched quota, and failed independent verification', async () => {
  const events: ServerMessage[] = [];
  const create = vi.fn<PatchCreator>(async () => result('quota'));
  const queue = new RuleQueue({
    send: (_c, e) => events.push(e),
    broadcast: (e) => events.push(e),
    apply: async () => {
      throw Error('winnable: invalid patch');
    },
    archive: [cached],
    create,
  });
  queue.submit({}, request('blocked', 'shit'));
  expect(create).not.toHaveBeenCalled();
  queue.submit({}, request('none', 'turn my keyboard into a submarine'));
  await vi.waitFor(() =>
    expect(events.some((e) => e.type === 'patchResult' && e.requestId === 'none')).toBe(true),
  );
  queue.submit({}, request('bad'));
  await vi.waitFor(() =>
    expect(
      events.some(
        (e) => e.type === 'patchResult' && e.requestId === 'bad' && e.status === 'failed',
      ),
    ).toBe(true),
  );
  await queue.close();
});
