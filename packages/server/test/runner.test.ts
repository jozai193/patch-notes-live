import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThreadEvent } from '@openai/codex-sdk';
import { codexRunner } from '../src/patch/runner.js';

const sdk = vi.hoisted(() => ({
  construct: vi.fn(),
  start: vi.fn(),
  streamed: vi.fn(),
}));
vi.mock('@openai/codex-sdk', () => ({
  Codex: class {
    constructor(options: unknown) {
      sdk.construct(options);
    }
    startThread(options: unknown) {
      sdk.start(options);
      return { id: 'mock-sdk-thread', runStreamed: sdk.streamed };
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('installed SDK adapter (mock SDK; never a real process)', () => {
  it('enforces sandbox/no approvals/no network, uses configuration, and filters child environment', () => {
    vi.stubEnv('PATCH_CODEX_MODEL', 'configured-model');
    vi.stubEnv('PATCH_CODEX_REASONING', 'medium');
    vi.stubEnv('TWITCH_CLIENT_SECRET', 'must-not-be-inherited');
    vi.stubEnv('OPENAI_API_KEY', 'must-not-be-inherited');
    vi.stubEnv('CODEX_API_KEY', 'fake-key-for-test');
    const runner = codexRunner('isolated-workspace');
    expect(runner.id).toBe('mock-sdk-thread');
    expect(sdk.start).toHaveBeenCalledWith({
      workingDirectory: 'isolated-workspace',
      skipGitRepoCheck: true,
      sandboxMode: 'workspace-write',
      approvalPolicy: 'never',
      networkAccessEnabled: false,
      webSearchMode: 'disabled',
      modelReasoningEffort: 'medium',
      model: 'configured-model',
    });
    const config = sdk.construct.mock.calls[0]![0] as {
      env: Record<string, string>;
      apiKey: string;
      configOverrides: string[];
    };
    expect(config.apiKey).toBe('fake-key-for-test');
    expect(config.env.TWITCH_CLIENT_SECRET).toBeUndefined();
    expect(config.env.OPENAI_API_KEY).toBeUndefined();
    expect(config.env.CODEX_API_KEY).toBeUndefined();
    expect(config.configOverrides).toEqual(['mcp_servers={}', 'plugins={}']);
  });

  it('uses runStreamed, forwards the abort signal, and reuses the same thread across turns', async () => {
    sdk.streamed.mockImplementation(async () => ({
      events: (async function* () {
        yield { type: 'turn.started' } satisfies ThreadEvent;
      })(),
    }));
    const runner = codexRunner('isolated-workspace');
    const controller = new AbortController();
    const events: ThreadEvent[] = [];
    const options = {
      signal: controller.signal,
      onEvent: (event: ThreadEvent) => events.push(event),
    };
    await runner.run('fixed trusted prompt', options);
    await runner.run('retry report', options);
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(sdk.streamed).toHaveBeenNthCalledWith(1, 'fixed trusted prompt', {
      signal: controller.signal,
    });
    expect(sdk.streamed).toHaveBeenNthCalledWith(2, 'retry report', { signal: controller.signal });
    expect(events).toEqual([{ type: 'turn.started' }, { type: 'turn.started' }]);
  });

  it.each(['turn.failed', 'error'] as const)(
    'propagates %s so the pipeline cannot verify an incomplete turn',
    async (type) => {
      sdk.streamed.mockImplementation(async () => ({
        events: (async function* () {
          yield type === 'turn.failed'
            ? { type, error: { message: 'transport failed' } }
            : { type, message: 'transport failed' };
        })(),
      }));
      const runner = codexRunner('isolated-workspace');
      await expect(
        runner.run('trusted prompt', { signal: new AbortController().signal, onEvent() {} }),
      ).rejects.toThrow('transport failed');
    },
  );
});
