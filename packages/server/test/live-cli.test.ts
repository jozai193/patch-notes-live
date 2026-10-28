import { expect, it, vi, afterEach } from 'vitest';
import { main } from '../src/cli.js';
const fake = vi.hoisted(() => ({ generate: vi.fn(), send: vi.fn(), write: vi.fn() }));
vi.mock('../src/patch/createPatch.js', () => ({ createPatch: fake.generate }));
vi.mock('../src/live-client.js', () => ({ liveRequest: fake.send }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, mkdir: vi.fn(), writeFile: fake.write };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('generate --apply sends only verified success source to the live hub without real Codex', async () => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  fake.generate.mockResolvedValue({
    status: 'ok',
    source: 'verified source string',
    report: { ok: true },
    durationMs: 1,
    attempts: 1,
    threadId: 'fake',
  });
  fake.send.mockResolvedValue({ v: 1, type: 'result', requestId: 'r', ok: true, patchId: 'patch' });
  expect(await main(['one game rule', '--apply'])).toBe(0);
  expect(fake.generate.mock.calls[0]?.[0]).toBe('one game rule');
  expect(fake.send).toHaveBeenCalledWith({
    type: 'applyRequest',
    source: 'verified source string',
    author: 'Codex',
  });
  expect(fake.write).toHaveBeenCalledTimes(2);
});
it('does not push a failed generation to the live hub', async () => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  fake.generate.mockResolvedValue({
    status: 'failed',
    reason: 'failed verification',
    durationMs: 1,
    attempts: 2,
    threadId: 'fake',
  });
  expect(await main(['one rule', '--apply'])).toBe(1);
  expect(fake.send).not.toHaveBeenCalled();
});
