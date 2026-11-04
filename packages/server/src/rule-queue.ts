import { matchArchive, moderateRule, NO_ARCHIVE_MATCH } from '@patch-notes-live/mod-api/archive';
import type { ArchivedMod } from '@patch-notes-live/mod-api/archive';
import type { ClientMessage, ServerMessage } from '@patch-notes-live/mod-api/protocol';
import { createPatch } from './patch/createPatch.js';
export type RuleRequest = Extract<ClientMessage, { type: 'requestPatch' }>;
export type PatchCreator = typeof createPatch;
export const clean = (text: string, max = 512) =>
  text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .trim()
    .slice(0, max);
/** A single worker and three waiting rules. Cooldowns belong to the connected client. */
export class RuleQueue<Client extends object> {
  private readonly last = new WeakMap<Client, number>();
  private readonly waiting: { client: Client; request: RuleRequest; at: number }[] = [];
  private running: Promise<void> | undefined;
  private closed = false;
  private readonly abort = new AbortController();
  constructor(
    private readonly options: {
      send(client: Client, event: ServerMessage): void;
      broadcast(event: ServerMessage): void;
      apply(source: string, author: string, origin: 'live' | 'archive'): Promise<void>;
      archive: readonly ArchivedMod[];
      create?: PatchCreator;
      now?: () => number;
    },
  ) {}
  submit(client: Client, input: RuleRequest): void {
    const checked = moderateRule(input.text, input.author);
    const fail = (reason: string) =>
      this.options.send(client, {
        v: 1,
        type: 'patchResult',
        requestId: input.requestId,
        status: 'rejected',
        reason,
        archived: false,
      });
    if (this.closed) return fail('The hub is stopping.');
    if ('reason' in checked) return fail(checked.reason);
    const now = (this.options.now ?? performance.now.bind(performance))();
    if (now - (this.last.get(client) ?? -Infinity) < 20000)
      return fail('Wait 20 seconds between rule requests.');
    if (this.running && this.waiting.length >= 3)
      return fail('The compile queue is full (three waiting). Try again soon.');
    this.last.set(client, now);
    const request = { ...input, ...checked };
    this.waiting.push({ client, request, at: now });
    this.options.broadcast({
      v: 1,
      type: 'compileEvent',
      requestId: request.requestId,
      phase: 'queued',
      text: this.running ? 'Queued behind the current patch.' : 'Preparing your patch.',
      elapsedMs: 0,
      request: request.text,
      author: request.author,
    });
    this.pump();
  }
  private pump(): void {
    if (this.running || this.closed) return;
    const item = this.waiting.shift();
    if (!item) return;
    // Set the running promise before invoking an injected creator, including synchronous callbacks.
    this.running = Promise.resolve()
      .then(() => this.run(item))
      .finally(() => {
        this.running = undefined;
        this.pump();
      });
  }
  private async run({ request, at }: { request: RuleRequest; at: number }): Promise<void> {
    const emit = (
      phase: Extract<ServerMessage, { type: 'compileEvent' }>['phase'],
      text: string,
    ) => {
      if (!this.closed)
        this.options.broadcast({
          v: 1,
          type: 'compileEvent',
          requestId: request.requestId,
          phase,
          text: clean(text) || 'Working on your patch.',
          elapsedMs: Math.min(
            1000000,
            Math.max(0, (this.options.now ?? performance.now.bind(performance))() - at),
          ),
          request: request.text,
          author: request.author,
        });
    };
    let status: Extract<ServerMessage, { type: 'patchResult' }>['status'] = 'failed',
      reason = 'Patch failed.',
      archived = false;
    try {
      const result = await (this.options.create ?? createPatch)(request.text, {
        signal: this.abort.signal,
        onEvent: (e) =>
          emit(
            e.phase === 'passed' ? 'testing' : e.phase,
            e.phase === 'passed' ? 'Pipeline verified; checking at the hub.' : e.text,
          ),
      });
      if (this.closed) return;
      status = result.status;
      reason = clean(result.reason ?? '');
      if (result.status === 'ok' && !result.source)
        throw Error('Patch generator returned no source.');
      if (result.status === 'ok' && result.source) {
        emit('testing', 'Running the hub’s independent safety checks.');
        await this.options.apply(result.source, request.author, 'live');
        emit('passed', 'All checks passed. Patch sent to the arena.');
        reason = 'Live Codex patch applied.';
      } else if (result.status === 'quota') {
        const cached = matchArchive(request.text, this.options.archive);
        if (cached) {
          await this.options.apply(cached.source, request.author, 'archive');
          archived = true;
          emit('passed', 'Archive patch verified and sent to the arena.');
          reason = 'Codex is out of quota — loaded a patch from the archive';
        } else reason = `Codex is out of quota. ${NO_ARCHIVE_MATCH}`;
      }
    } catch (error) {
      status = 'failed';
      reason = clean(error instanceof Error ? error.message : 'Patch verification failed.');
      emit('failed', reason);
    }
    if (!this.closed)
      this.options.broadcast({
        v: 1,
        type: 'patchResult',
        requestId: request.requestId,
        status,
        reason,
        archived,
      });
  }
  async close(): Promise<void> {
    this.closed = true;
    this.waiting.length = 0;
    this.abort.abort();
    await this.running;
  }
}
