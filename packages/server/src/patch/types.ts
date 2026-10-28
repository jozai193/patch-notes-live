import type { ThreadEvent } from '@openai/codex-sdk';
import type { Report } from '@patch-notes-live/harness';

export interface CompileEvent {
  phase: 'thinking' | 'editing' | 'testing' | 'passed' | 'failed' | 'rejected' | 'quota';
  text: string;
}

export interface PatchRunner {
  readonly id: string | null;
  run(
    prompt: string,
    options: { signal: AbortSignal; onEvent: (event: ThreadEvent) => void },
  ): Promise<void>;
}

export type RunnerFactory = (workspace: string) => PatchRunner;

export interface PatchOptions {
  onEvent?: (event: CompileEvent) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  runner?: RunnerFactory;
}

export interface PatchResult {
  status: 'ok' | 'failed' | 'rejected' | 'timeout' | 'quota';
  source?: string;
  report?: Report;
  reason?: string;
  durationMs: number;
  attempts: number;
  threadId: string | null;
}
