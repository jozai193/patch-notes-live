import type { UIEvent } from '@patch-notes-live/engine';

interface Toast {
  node: HTMLDivElement;
  remaining: number;
}
export class Feedback {
  private toasts: Toast[] = [];
  private tintRemaining = 0;
  private tintDuration = 0;
  constructor(
    private readonly container: HTMLElement,
    private readonly tint: HTMLElement,
  ) {}
  accept(events: UIEvent[]): void {
    for (const event of events) {
      if (event.type === 'toast') {
        const node = document.createElement('div');
        node.className = 'toast';
        node.textContent = event.text;
        this.container.append(node);
        this.toasts.push({ node, remaining: 4 });
        if (this.toasts.length > 5) this.toasts.shift()!.node.remove();
      } else if (event.type === 'tint') {
        this.tint.style.backgroundColor = event.color;
        this.tintRemaining = event.ms / 1000;
        this.tintDuration = this.tintRemaining;
      }
    }
  }
  update(dt: number): void {
    for (const toast of this.toasts) {
      toast.remaining -= dt;
      toast.node.style.opacity = String(Math.max(0, Math.min(1, toast.remaining / 0.6)));
      if (toast.remaining <= 0) toast.node.remove();
    }
    this.toasts = this.toasts.filter((t) => t.remaining > 0);
    this.tintRemaining = Math.max(0, this.tintRemaining - dt);
    this.tint.style.opacity = String(
      this.tintDuration ? (0.3 * this.tintRemaining) / this.tintDuration : 0,
    );
  }
  clear(): void {
    for (const toast of this.toasts) toast.node.remove();
    this.toasts = [];
    this.tintRemaining = 0;
    this.tintDuration = 0;
    this.tint.style.opacity = '0';
  }
}
