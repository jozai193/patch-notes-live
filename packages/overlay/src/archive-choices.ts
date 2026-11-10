import type { ArchivedMod } from '@patch-notes-live/mod-api/archive';

/** Two rows of whole chips. Paging keeps every archive entry reachable without clipping. */
export class ArchiveChoices {
  private start = 0;
  private shown = 0;
  private width = -1;
  private scheduled: number | undefined;
  private readonly buttons: HTMLButtonElement[];
  constructor(
    private readonly list: HTMLElement,
    private readonly more: HTMLButtonElement,
    entries: readonly ArchivedMod[],
    select: (entry: ArchivedMod) => void,
  ) {
    this.buttons = entries.map((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'archive-item';
      button.textContent = entry.name;
      button.title = entry.patchNotes;
      button.addEventListener('click', () => select(entry));
      return button;
    });
    more.addEventListener('click', () => {
      this.start = (this.start + this.shown) % this.buttons.length;
      this.fit();
    });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width === this.width) return;
      this.width = entry.contentRect.width;
      // Refitting changes height; only width changes schedule work, outside delivery.
      if (this.scheduled !== undefined) cancelAnimationFrame(this.scheduled);
      this.scheduled = requestAnimationFrame(() => {
        this.scheduled = undefined;
        this.fit();
      });
    });
    observer.observe(list);
    window.addEventListener(
      'pagehide',
      () => {
        observer.disconnect();
        if (this.scheduled !== undefined) cancelAnimationFrame(this.scheduled);
      },
      { once: true },
    );
    void document.fonts.ready.then(() => this.fit());
    this.fit();
  }
  private fit(): void {
    if (!this.list.clientWidth) {
      for (const button of this.buttons) button.hidden = true;
      this.list.replaceChildren(...this.buttons);
      return;
    }
    const ordered = [...this.buttons.slice(this.start), ...this.buttons.slice(0, this.start)];
    for (const button of ordered) button.hidden = false;
    this.list.replaceChildren(...ordered);
    const rows = new Set<number>();
    this.shown = 0;
    // Measure before hiding anything: hidden buttons must not reflow into earlier rows.
    const positions = ordered.map((button) => button.offsetTop);
    for (let i = 0; i < ordered.length; i++) {
      rows.add(positions[i]!);
      const visible = rows.size <= 2;
      ordered[i]!.hidden = !visible;
      if (visible) this.shown++;
    }
    this.more.disabled = this.shown === this.buttons.length;
  }
}
