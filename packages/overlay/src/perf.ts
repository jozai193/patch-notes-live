export class RollingSamples {
  private readonly samples: number[] = [];
  private cursor = 0;

  constructor(private readonly capacity = 300) {}

  push(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    this.samples[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  clear(): void {
    this.samples.length = 0;
    this.cursor = 0;
  }

  summary(): { count: number; mean: number; p95: number } {
    const count = this.samples.length;
    if (!count) return { count: 0, mean: 0, p95: 0 };
    const sorted = [...this.samples].sort((a, b) => a - b);
    return {
      count,
      mean: this.samples.reduce((a, b) => a + b, 0) / count,
      p95: sorted[Math.ceil(count * 0.95) - 1]!,
    };
  }
}

export class PerfReadout {
  private readonly frames = new RollingSamples();
  private readonly ticks = new RollingSamples();
  private lastUpdate = -Infinity;

  constructor(private readonly output: HTMLElement) {
    output.hidden = false;
  }
  frame(milliseconds: number): void {
    if (milliseconds > 0) this.frames.push(milliseconds);
  }
  tick(milliseconds: number): void {
    this.ticks.push(milliseconds);
  }

  reset(): void {
    this.frames.clear();
    this.ticks.clear();
    this.lastUpdate = -Infinity;
  }

  update(now: number): void {
    if (now - this.lastUpdate < 250) return;
    this.lastUpdate = now;
    const frames = this.frames.summary(),
      ticks = this.ticks.summary();
    this.output.textContent = `FPS ${frames.mean ? (1000 / frames.mean).toFixed(1) : '—'}  FRAME p95 ${frames.p95.toFixed(2)} ms\nSANDBOX mean ${ticks.mean.toFixed(3)} / p95 ${ticks.p95.toFixed(3)} ms\n${ticks.count}/300 ticks · ${frames.count}/300 frames`;
  }
}
