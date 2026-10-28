import { expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage, sourceValid } from '../src/protocol.js';

const patch = {
  patchId: 'p-1',
  name: 'Split',
  description: 'Split enemies',
  author: 'local',
  source: 'export default {}',
};
it('accepts versioned hello, patches, acknowledgements and bounded telemetry', () => {
  for (const message of [
    { v: 1, type: 'hello', patches: [patch] },
    { v: 1, type: 'applyPatch', ...patch },
    { v: 1, type: 'revertPatch', patchId: 'p-1', reason: 'expired' },
    { v: 1, type: 'result', requestId: 'r-1', ok: true, patchId: 'p-1' },
  ])
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
  for (const message of [
    { v: 1, type: 'hello', role: 'overlay' },
    { v: 1, type: 'patchApplied', patchId: 'p-1', version: 'v1.1' },
    { v: 1, type: 'patchReverted', patchId: 'p-1', reason: 'too slow' },
    {
      v: 1,
      type: 'telemetry',
      fps: 60,
      frameP95: 17,
      sandboxP95: 0.5,
      activePatches: [{ patchId: 'p-1', name: 'Split', author: 'local', remainingSeconds: 120 }],
    },
    { v: 1, type: 'applyRequest', requestId: 'r-1', source: patch.source, author: 'local' },
  ])
    expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
});
it('rejects malformed messages, unknown versions/fields, duplicate IDs and oversized UTF-8 sources', () => {
  for (const message of [
    { v: 2, type: 'hello', patches: [] },
    { v: 1, type: 'hello', patches: [patch, patch] },
    { v: 1, type: 'applyPatch', ...patch, source: 'é'.repeat(4097) },
    { v: 1, type: 'applyPatch', ...patch, extra: true },
    { v: 1, type: 'revertPatch', patchId: '../escape', reason: 'x' },
  ])
    expect(parseServerMessage(JSON.stringify(message))).toBeUndefined();
  for (const message of [
    { v: 1, type: 'telemetry', fps: -1, frameP95: 17, sandboxP95: 0, activePatches: [] },
    { v: 1, type: 'telemetry', fps: null, frameP95: 17, sandboxP95: 0, activePatches: [] },
    { v: 1, type: 'hello', role: 'admin' },
    { v: 1, type: 'patchApplied', patchId: 'p', version: 1 },
    { v: 1, type: 'patchReverted', patchId: 'p', reason: 'x\nspoof' },
  ])
    expect(parseClientMessage(JSON.stringify(message))).toBeUndefined();
  for (const value of ['not json', 'null', '[]', '{', '{}'])
    expect(parseServerMessage(value)).toBeUndefined();
  expect(sourceValid('é'.repeat(4096))).toBe(true);
});
