import index from '../../../mods/archive/index.json' with { type: 'json' };
import {
  archivePatch,
  matchArchive,
  closestArchive,
  moderateRule,
  NO_ARCHIVE_MATCH,
} from '@patch-notes-live/mod-api/archive';
import type { ArchivedMod } from '@patch-notes-live/mod-api/archive';
import type {
  ClientMessage,
  ServerMessage,
  CompilePhase,
} from '@patch-notes-live/mod-api/protocol';
import type { PatchManager } from './patch-manager.js';
const files = import.meta.glob('../../../mods/archive/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
export const archive: ArchivedMod[] = index.map((entry) => {
  const source = files[`../../../mods/archive/${entry.file}`];
  if (!source) throw Error(`Missing archive mod: ${entry.file}`);
  return { ...entry, source };
});
export class RuleUI {
  private connected = false;
  private localId = 0;
  private busy = false;
  private lastLocal = -Infinity;
  private activeId: string | undefined;
  private phase: CompilePhase = 'queued';
  private started = 0;
  private terminal = false;
  private showing = false;
  private hideAt = Infinity;
  private readonly steps = ['thinking', 'editing', 'testing', 'passed'] as const;
  private readonly completed = new Set<string>();
  private readonly form: HTMLFormElement;
  private readonly rule: HTMLInputElement;
  private readonly author: HTMLInputElement;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly list: HTMLElement;
  private readonly message: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly bar: HTMLProgressElement;
  constructor(
    private readonly options: {
      manager: PatchManager;
      send: (message: ClientMessage) => boolean;
      notice: (text: string, error?: boolean) => void;
      ensurePlaying: () => Promise<void>;
    },
  ) {
    const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    this.form = get('rule-form');
    this.rule = get('rule-input');
    this.author = get('rule-author');
    this.button = get('rule-submit');
    this.panel = get('compile-panel');
    this.list = get('compile-steps');
    this.message = get('compile-message');
    this.timer = get('compile-time');
    this.bar = get('compile-progress');
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });
    const library = get('archive-list');
    for (const entry of archive) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'archive-item';
      button.textContent = entry.name;
      button.title = entry.patchNotes;
      button.addEventListener('click', () => {
        void this.applyArchive(entry, 'Archive patch selected — no live AI generation.');
      });
      library.append(button);
    }
    get('archive-count').textContent = String(archive.length);
    this.setConnected(false);
  }
  setConnected(value: boolean): void {
    if (this.connected && !value && this.busy) {
      this.showPhase('failed', 'Hub disconnected. Choose an archive patch or reconnect.');
      this.finish();
    }
    this.connected = value;
    document.getElementById('demo-badge')!.hidden = value;
    document.getElementById('rule-mode')!.textContent = value
      ? 'Live Codex · ~60–90 s'
      : 'Archive · instant';
  }
  private begin(id: string, request: string, author: string): void {
    this.panel.querySelector('h2')!.textContent = 'Compiling patch';
    this.panel.setAttribute('aria-label', 'Compiling patch');
    this.panel.dataset.state = 'compile';
    this.list.hidden = this.bar.hidden = this.timer.hidden = false;
    document.getElementById('compile-request')!.hidden = false;
    document.getElementById('archive-suggestions')!.replaceChildren();
    this.showing = true;
    this.activeId = id;
    this.completed.clear();
    this.phase = 'queued';
    this.started = performance.now();
    this.terminal = false;
    this.panel.hidden = false;
    document.getElementById('compile-request')!.textContent = `“${request}” — ${author}`;
    this.list.replaceChildren();
    for (const step of this.steps) {
      const li = document.createElement('li');
      li.dataset.phase = step;
      li.textContent = step;
      this.list.append(li);
    }
  }
  private showPhase(phase: CompilePhase, text: string, elapsed?: number): void {
    this.phase = phase;
    this.message.textContent = text;
    if (elapsed !== undefined) this.started = performance.now() - elapsed;
    const index = this.steps.indexOf(phase as (typeof this.steps)[number]);
    if (index >= 0) for (let i = 0; i < index; i++) this.completed.add(this.steps[i]!);
    if (phase === 'passed') for (const step of this.steps) this.completed.add(step);
    for (const li of this.list.children) {
      const node = li as HTMLElement;
      node.classList.toggle('done', this.completed.has(node.dataset.phase!));
      node.classList.toggle('current', node.dataset.phase === phase);
    }
    this.bar.value =
      phase === 'passed'
        ? 100
        : phase === 'testing'
          ? 80
          : phase === 'editing'
            ? 50
            : phase === 'thinking'
              ? 20
              : 5;
  }
  private async submit(): Promise<void> {
    if (this.busy) return;
    const checked = moderateRule(this.rule.value, this.author.value);
    if ('reason' in checked) {
      this.options.notice(checked.reason, true);
      return;
    }
    if (this.connected && performance.now() - this.lastLocal < 20000) {
      this.options.notice('Wait 20 seconds between rule requests.', true);
      return;
    }
    if (this.connected) this.lastLocal = performance.now();
    this.busy = true;
    this.button.disabled = true;
    const requestId =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `rule-${Date.now()}-${++this.localId}`;
    this.begin(requestId, checked.text, checked.author);
    if (
      this.connected &&
      this.options.send({ v: 1, type: 'requestPatch', requestId, ...checked })
    ) {
      this.showPhase('queued', 'Sending your rule to the local Codex hub.');
      return;
    }
    const entry = matchArchive(checked.text, archive);
    if (entry)
      await this.applyArchive(
        entry,
        'Loaded a patch from the archive — no live AI generation.',
        checked.author,
        true,
      );
    else {
      this.panel.querySelector('h2')!.textContent = 'No match in archive';
      this.panel.setAttribute('aria-label', 'No match in archive');
      this.panel.dataset.state = 'no-match';
      this.list.hidden = this.bar.hidden = this.timer.hidden = true;
      this.bar.value = 0;
      document.getElementById('compile-request')!.hidden = true;
      this.message.textContent = NO_ARCHIVE_MATCH;
      const suggestions = document.getElementById('archive-suggestions')!;
      for (const candidate of closestArchive(checked.text, archive)) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'archive-suggestion';
        chip.textContent = candidate.name;
        chip.title = candidate.request;
        chip.addEventListener('click', () => {
          void this.applyArchive(candidate, 'Archive suggestion selected — no live AI generation.');
        });
        suggestions.append(chip);
      }
      this.finish(6000);
    }
  }
  private async applyArchive(
    entry: ArchivedMod,
    label: string,
    author = this.author.value.trim() || 'You',
    fromSubmit = false,
  ): Promise<void> {
    if (this.busy && !fromSubmit) return;
    const checked = moderateRule(entry.request, author);
    if ('reason' in checked) {
      this.options.notice(checked.reason, true);
      return;
    }
    author = checked.author;
    this.busy = true;
    this.button.disabled = true;
    if (!this.activeId || this.terminal)
      this.begin(`archive-${++this.localId}`, entry.request, author);
    this.panel.querySelector('h2')!.textContent = 'Archive patch';
    this.panel.dataset.state = 'archive';
    this.panel.setAttribute('aria-label', 'Archive patch');
    [...this.list.children].forEach((node, i) => {
      node.textContent = ['cached', 'loading', 'sandbox', 'applied'][i]!;
    });
    this.showPhase('testing', 'Loading a verified archive patch into its own sandbox.');
    try {
      await this.options.ensurePlaying();
      await this.options.manager.apply(
        archivePatch(entry, `archive-${Date.now()}-${++this.localId}`, author),
      );
      this.showPhase('passed', label);
      this.options.notice(label);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Archive load failed.';
      this.showPhase('failed', reason);
      this.options.notice(reason, true);
    } finally {
      this.finish();
    }
  }
  private finish(duration = 8000): void {
    this.hideAt = performance.now() + duration;
    this.terminal = true;
    this.busy = false;
    this.button.disabled = false;
  }
  receive(event: ServerMessage): boolean {
    if (event.type === 'compileEvent') {
      if (this.activeId !== event.requestId) {
        if (this.busy) return true;
        this.begin(event.requestId, event.request, event.author);
      }
      this.showPhase(event.phase, event.text, event.elapsedMs);
      return true;
    }
    if (event.type === 'patchResult') {
      if (this.activeId !== event.requestId) return true;
      if (event.status === 'ok' || event.archived) {
        this.showPhase('passed', event.reason);
        if (event.archived) this.options.notice(event.reason);
      } else {
        this.showPhase(event.status === 'rejected' ? 'rejected' : 'failed', event.reason);
        this.options.notice(event.reason, true);
      }
      this.finish();
      return true;
    }
    return false;
  }
  update(now: number, gameOver = false): void {
    if (this.terminal && now >= this.hideAt) this.showing = false;
    this.panel.hidden = !this.showing || gameOver;
    document.querySelector('.sidebar')!.classList.toggle('has-feedback', !this.panel.hidden);
    if (!this.panel.hidden && !this.terminal)
      this.timer.textContent = `${((now - this.started) / 1000).toFixed(0)}s`;
  }
}
export function firstRun(): void {
  const panel = document.getElementById('first-run')!;
  try {
    panel.hidden =
      document.documentElement.classList.contains('obs') ||
      localStorage.getItem('patch-notes-live:onboarded') === '1';
  } catch {
    panel.hidden = document.documentElement.classList.contains('obs');
  }
  document.getElementById('first-run-dismiss')!.addEventListener('click', () => {
    panel.hidden = true;
    try {
      localStorage.setItem('patch-notes-live:onboarded', '1');
    } catch {
      /* Private/storage-restricted tabs remain playable. */
    }
  });
}
