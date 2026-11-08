import readme from '../../../README.md?raw';
import { archive } from './rules.js';
import { AttractMode } from './attract.js';
import { reducedMotion } from './tokens.js';
const examples = [
  {
    name: 'Enemies run away',
    before: ['Enemies ', 'chase', ' you.'],
    after: ['Enemies ', 'run away from', ' you.'],
  },
  { name: 'Huge player', before: ['You are ', 'small', '.'], after: ['You are ', 'huge', '.'] },
  {
    name: 'Moon gravity',
    before: ['Gravity is ', 'normal', '.'],
    after: ['Gravity is ', 'on the moon', '.'],
  },
  {
    name: 'Rainbow enemies',
    before: ['Enemies are ', 'red', '.'],
    after: ['Enemies are ', 'a rainbow', '.'],
  },
];
export function headlineFrame(milliseconds: number, reduce: boolean) {
  // A queued RAF timestamp can precede this instance's performance.now() origin.
  milliseconds = Math.max(0, milliseconds);
  const elapsed = milliseconds % 8000;
  return {
    example: Math.floor(milliseconds / 8000) % examples.length,
    diff: reduce || elapsed >= 1800,
    characters: Math.floor(elapsed / 45),
  };
}
export class Landing {
  readonly attract: AttractMode;
  private started = performance.now();
  private signature = '';
  private closed = false;
  constructor(private readonly play: () => void) {
    this.attract = new AttractMode(document.getElementById('attract-game') as HTMLCanvasElement);
    void this.attract.start().catch(() => {
      document.getElementById('attract-note')!.textContent =
        'Try a patch. The playable game is ready.';
    });
    document.getElementById('play')!.addEventListener('click', () => this.enter());
    window.addEventListener('keydown', (event) => {
      if (this.closed || event.key !== 'Enter' || event.repeat) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('a,input,summary,button:not(#play)')
      )
        return;
      event.preventDefault();
      this.enter();
    });
    const track = document.getElementById('notes-ticker-track')!;
    for (let repeat = 0; repeat < 2; repeat++)
      for (const entry of [
        ...archive.slice(0, 3),
        archive.find((e) => e.name === 'Enemies run away')!,
        archive[4]!,
      ]) {
        const note = document.createElement('span');
        note.className = 'ticker-note';
        if (repeat) note.setAttribute('aria-hidden', 'true');
        const mark = document.createElement('span');
        mark.textContent = /away/i.test(entry.name)
          ? '−'
          : /gravity|lava/i.test(entry.name)
            ? '~'
            : '+';
        mark.className =
          mark.textContent === '+' ? 'plus' : mark.textContent === '−' ? 'minus' : 'changed';
        const text = document.createElement('span');
        text.textContent = entry.patchNotes;
        note.append(mark, text);
        track.append(note);
      }
    document.getElementById('archive-total')!.textContent =
      `${archive.length} AI-written patches to try offline.`;
    // Render the canonical README section as plain text/code, never inject Markdown as HTML.
    const section = readme.split('## Run locally')[1]?.split('\n## ')[0] ?? '';
    const target = document.getElementById('readme-local')!;
    section.split('```').forEach((part, index) => {
      const node = document.createElement(index % 2 ? 'pre' : 'p');
      node.textContent = index % 2 ? part.replace(/^sh\s*/, '').trim() : part.trim();
      target.append(node);
    });
    document.getElementById('live-ai-link')!.addEventListener('click', () => {
      (document.getElementById('run-locally') as HTMLDetailsElement).open = true;
    });
  }
  private enter(): void {
    if (this.closed) return;
    this.dispose();
    this.play();
  }
  update(now: number): void {
    if (this.closed) return;
    this.attract.update(now);
    const frame = headlineFrame(now - this.started, reducedMotion()),
      example = examples[frame.example]!;
    const signature = `${frame.example}/${frame.diff}/${frame.diff ? 0 : frame.characters}`;
    if (signature === this.signature) return;
    this.signature = signature;
    const headline = document.getElementById('hero-headline')!;
    headline.dataset.phase = frame.diff ? 'diff' : 'typing';
    const lines = document.getElementById('hero-lines')!;
    lines.replaceChildren();
    if (frame.diff) {
      for (const [index, words] of [example.before, example.after].entries()) {
        const row = document.createElement('span');
        row.className = `hero-row ${index ? 'new' : 'old'}`;
        const mark = document.createElement('span');
        mark.className = 'hero-gutter';
        mark.textContent = index ? '+' : '−';
        const sentence = document.createElement('span');
        const changed = document.createElement(index ? 'ins' : 'del');
        changed.textContent = words[1]!;
        sentence.append(words[0]!, changed, words[2]!);
        row.append(mark, sentence);
        lines.append(row);
      }
    } else lines.textContent = example.before.join('').slice(0, frame.characters);
    if (reducedMotion()) lines.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180 });
    document.getElementById('hero-version')!.textContent =
      `v1.${frame.example + 1} · ${example.name}`;
  }
  pause(): void {
    this.attract.pause();
  }
  dispose(): void {
    this.closed = true;
    this.attract.dispose();
  }
}
