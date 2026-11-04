import { SandboxHost } from '@patch-notes-live/mod-api';
import type { ModInfo } from '@patch-notes-live/mod-api';
import type { Patch, ActivePatch } from '@patch-notes-live/mod-api/protocol';

interface Entry {
  patch: Patch;
  expiresAt: number;
  applied: boolean;
  version: string;
  samples: { at: number; ms: number }[];
  startedAt?: number;
}
export interface PatchEvents {
  applied(patch: Patch, version: string): void;
  reverted(patchId: string, reason: string): void;
}

export class PatchManager {
  private readonly entries = new Map<string, Entry>();
  private readonly removed = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private count = 0;
  private closed = false;
  private constructor(
    public host: SandboxHost,
    private readonly events: PatchEvents,
    private readonly clock: () => number,
    private readonly lifetimeMs: number,
  ) {}
  static async create(
    events: PatchEvents,
    options: { clock?: () => number; lifetimeMs?: number } = {},
  ) {
    const lifetime = options.lifetimeMs ?? 120_000;
    if (!Number.isFinite(lifetime) || lifetime <= 0)
      throw new Error('Patch lifetime must be positive');
    return new PatchManager(
      await SandboxHost.create([]),
      events,
      options.clock ?? (() => performance.now()),
      lifetime,
    );
  }
  get version(): string {
    return `v${((10 + this.count) / 10).toFixed(1)}`;
  }
  get active(): ActivePatch[] {
    return [...this.entries.values()].map(({ patch, expiresAt }) => ({
      patchId: patch.patchId,
      name: patch.name,
      author: patch.author,
      remainingSeconds: Math.max(0, Math.ceil((expiresAt - this.clock()) / 1000)),
    }));
  }
  removedReason(id: string): string | undefined {
    return this.removed.get(id);
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.queue.then(run);
    this.queue = next.catch(() => {});
    return next;
  }
  apply(patch: Patch): Promise<boolean> {
    return this.serial(async () => {
      if (this.closed || this.removed.has(patch.patchId) || this.entries.has(patch.patchId))
        return false;
      if (this.entries.size >= 3) this.revert(this.entries.keys().next().value!, 'expired');
      await this.host.addMod(patch.patchId, patch.source);
      if (this.closed || this.removed.has(patch.patchId)) {
        this.host.removeMod(patch.patchId);
        return false;
      }
      this.count++;
      this.entries.set(patch.patchId, {
        patch: {
          ...patch,
          patchNotes: this.host.mods.find((m) => m.patchId === patch.patchId)?.patchNotes,
        },
        expiresAt: this.clock() + this.lifetimeMs,
        applied: false,
        version: this.version,
        samples: [],
      });
      return true;
    });
  }
  revert(id: string, reason: string): boolean {
    reason =
      reason
        .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
        .trim()
        .slice(0, 512) || 'patch reverted';
    this.removed.set(id, reason);
    if (this.removed.size > 256) this.removed.delete(this.removed.keys().next().value!);
    if (!this.entries.delete(id)) return false;
    this.host.removeMod(id);
    this.events.reverted(id, reason);
    return true;
  }
  update(): void {
    for (const [id, entry] of this.entries)
      if (this.clock() >= entry.expiresAt) this.revert(id, 'expired');
  }
  observeTick(tick: number, timings: readonly ModInfo[] = this.host.mods): void {
    this.update();
    for (const [id, entry] of this.entries) {
      const mod = timings.find((mod) => mod.patchId === id);
      if (!mod) continue;
      if (mod.disabled) {
        const first = this.host.faults.find(
          (fault) => fault.modId === mod.id && fault.kind !== 'disabled',
        );
        this.revert(id, first?.message ?? mod.disabledReason ?? 'sandbox disabled');
        continue;
      }
      if (mod.tick !== tick) continue;
      if (!entry.applied) {
        entry.applied = true;
        this.events.applied(entry.patch, entry.version);
      }
      const now = this.clock();
      entry.startedAt ??= now;
      entry.samples.push({ at: now, ms: mod.timeThisTickMs });
      entry.samples = entry.samples.filter((sample) => sample.at >= now - 3000);
      if (now - entry.startedAt >= 3000 && entry.samples.length >= 120) {
        const sorted = entry.samples.map((sample) => sample.ms).sort((a, b) => a - b);
        if (sorted[Math.ceil(sorted.length * 0.95) - 1]! > 4) this.revert(id, 'too slow');
      }
    }
  }
  restart(): Promise<void> {
    return this.serial(async () => {
      this.update();
      const fresh = await SandboxHost.create([]);
      try {
        for (const entry of this.entries.values())
          await fresh.addMod(entry.patch.patchId, entry.patch.source);
      } catch (error) {
        fresh.dispose();
        throw error;
      }
      this.host.dispose();
      this.host = fresh;
      for (const entry of this.entries.values()) {
        entry.samples = [];
        delete entry.startedAt;
      }
    });
  }
  dispose(): void {
    this.closed = true;
    this.host.dispose();
  }
}
