import { World, botIntent, composeHosts } from '@patch-notes-live/engine';
import { archivePatch } from '@patch-notes-live/mod-api/archive';
import { PatchManager } from './patch-manager.js';
import { archive } from './rules.js';
import { Effects } from './effects.js';
import { render } from './renderer.js';
import { planFrame } from './loop.js';
/** Separate demo world. No state, RNG, patches or score can leak into the playable run. */
export class AttractMode {
  private manager: PatchManager | undefined;
  private world: World | undefined;
  private effects = new Effects();
  private closed = false;
  private busy = false;
  private index = 0;
  private nextPatch = 0;
  private last: number | undefined;
  private accumulator = 0;
  private visualTime = 0;
  private readonly choices = ['Enemies run away', 'Huge player', 'Moon gravity', 'Rainbow enemies']
    .map((name) => archive.find((e) => e.name === name))
    .filter((e) => e !== undefined);
  constructor(private readonly canvas: HTMLCanvasElement) {}
  async start(): Promise<void> {
    const manager = await PatchManager.create({
      applied: (patch) => {
        this.effects.rewrite(patch.name);
        document.getElementById('attract-note')!.textContent =
          patch.patchNotes || patch.description;
      },
      reverted: () => {},
    });
    if (this.closed) {
      manager.dispose();
      return;
    }
    this.manager = manager;
    this.makeWorld();
    await this.changePatch();
    this.nextPatch = performance.now() + 8000;
  }
  private makeWorld(): void {
    this.effects = new Effects();
    this.world = new World(
      1,
      composeHosts(this.manager!.host, { onKill: (_g, e) => this.effects.kill(e.victim) }),
    );
    this.accumulator = 0;
  }
  private async changePatch(): Promise<void> {
    if (this.busy || this.closed || !this.manager) return;
    this.busy = true;
    try {
      const entry = this.choices[this.index++ % this.choices.length];
      if (entry) await this.manager.apply(archivePatch(entry, `attract-${this.index}`, 'Archive'));
    } finally {
      this.busy = false;
    }
  }
  update(now: number): void {
    const dt = this.last === undefined ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.world || !this.manager || this.closed || this.busy) return;
    if (this.world.snapshot().gameOver) {
      this.busy = true;
      const manager = this.manager;
      void manager
        .restart()
        .then(() => {
          if (this.closed) manager.dispose();
          else this.makeWorld();
        })
        .finally(() => {
          this.busy = false;
        });
      return;
    }
    if (now >= this.nextPatch) {
      this.nextPatch = now + 8000;
      void this.changePatch().catch(() => {
        document.getElementById('attract-note')!.textContent = 'Try a rule in the playable game.';
      });
    }
    const plan = planFrame(this.accumulator, dt);
    this.accumulator = plan.accumulator;
    for (let i = 0; i < plan.ticks; i++) {
      const before = this.world.snapshot();
      this.world.tick(botIntent(before));
      const after = this.world.snapshot();
      this.manager.observeTick(after.tick);
      this.effects.observe(before, after);
    }
    this.effects.accept(this.world.drainEvents());
    this.effects.update(dt);
    this.visualTime += dt;
    const snapshot = this.world.snapshot();
    render(
      this.canvas.getContext('2d')!,
      snapshot,
      this.effects,
      { x: botIntent(snapshot).aimX, y: botIntent(snapshot).aimY },
      false,
      this.visualTime,
    );
    this.canvas.dataset.tick = String(snapshot.tick);
    this.canvas.dataset.patches = String(this.manager.active.length);
  }
  pause(): void {
    this.last = undefined;
    this.accumulator = 0;
  }
  dispose(): void {
    this.closed = true;
    this.manager?.dispose();
    this.manager = undefined;
    this.world = undefined;
  }
}
