import type { Patch } from '@patch-notes-live/mod-api/protocol';
import type { ActivePatch } from '@patch-notes-live/mod-api/protocol';
import { authorLabel, changeMark } from './changelog.js';
interface FeedEntry {
  patch: Patch;
  version: string;
  slot: number;
  reason?: string;
}
/** Cosmetic identities/history stay outside the world and survive a run restart. */
export class PatchFeed {
  readonly entries: FeedEntry[] = [];
  private next = 0;
  private revision = 0;
  private signature = '';
  slot(id: string): number | undefined {
    return this.entries.find((e) => e.patch.patchId === id)?.slot;
  }
  applied(patch: Patch, version: string): void {
    this.revision++;
    const used = new Set(this.entries.filter((e) => !e.reason).map((e) => e.slot));
    while (used.has((this.next % 6) + 1)) this.next++;
    this.entries.push({ patch, version, slot: (this.next++ % 6) + 1 });
    if (this.entries.length > 30) this.entries.shift();
  }
  reverted(id: string, reason: string): void {
    const entry = this.entries.find((e) => e.patch.patchId === id);
    if (entry) {
      entry.reason = reason;
      this.revision++;
    }
  }
  update(container: HTMLElement, active: ActivePatch[], currentAuthor: string): void {
    const signature = JSON.stringify([this.revision, active, currentAuthor]);
    if (signature === this.signature) return;
    this.signature = signature;
    container.replaceChildren();
    for (const entry of [...this.entries].reverse()) {
      const remaining = active.find((p) => p.patchId === entry.patch.patchId)?.remainingSeconds;
      const row = document.createElement('article');
      row.className = `patch-entry${entry.reason ? ' removed' : ''}`;
      row.dataset.patchId = entry.patch.patchId;
      row.dataset.slot = String(entry.slot);
      row.style.setProperty('--patch-color', `var(--patch-${entry.slot})`);
      const header = document.createElement('div');
      header.className = 'patch-entry-heading';
      const version = document.createElement('span');
      version.className = 'patch-version';
      version.textContent = entry.version;
      const countdown = document.createElement('span');
      countdown.className = 'patch-countdown';
      countdown.textContent = entry.reason ? 'Reverted' : `${remaining ?? 0}s`;
      header.append(version, countdown);
      const name = document.createElement('h3');
      name.textContent = entry.patch.name;
      const note = document.createElement('p');
      note.className = 'patch-line';
      const mark = document.createElement('span');
      const change = changeMark(entry.reason ? 'remove' : (entry.patch.change ?? 'add'));
      mark.className = change.className;
      mark.textContent = change.symbol;
      const text = document.createElement('span');
      text.textContent = entry.reason
        ? `Reverted: ${entry.reason}`
        : entry.patch.patchNotes || entry.patch.description;
      note.append(mark, text);
      const author = document.createElement('small');
      const { text: label, yours } = authorLabel(entry.patch.author, currentAuthor);
      author.className = yours ? 'your-author' : '';
      author.textContent = `${label}${entry.patch.origin === 'archive' ? ' · archive' : ''}`;
      row.append(header, name, note, author);
      container.append(row);
    }
    const base = document.createElement('article');
    base.className = 'base-entry';
    const version = document.createElement('span');
    version.className = 'patch-version';
    version.textContent = 'v1.0';
    const note = document.createElement('p');
    note.className = 'patch-line';
    const mark = document.createElement('span');
    mark.className = 'plus';
    mark.textContent = '+';
    const text = document.createElement('span');
    text.textContent = 'Survive. The rest is up for revision.';
    note.append(mark, text);
    base.append(version, note);
    container.append(base);
  }
}
