import type { Entity, Snapshot, UIEvent } from '@patch-notes-live/engine';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

/** Cosmetic state and randomness live here, never in the engine or its RNG. */
export class Effects {
  private particles: Particle[] = [];
  private readonly flashes = new Map<number, number>();
  private shake = 0;

  observe(previous: Snapshot, current: Snapshot): void {
    const old = new Map(previous.entities.map((e) => [e.id, e]));
    for (const e of current.entities) {
      if (e.hp < (old.get(e.id)?.hp ?? e.hp)) {
        this.flashes.set(e.id, 0.16);
        if (e.kind === 'player') this.shake = 0.18;
      }
    }
  }

  kill(entity: Entity): void {
    if (entity.kind !== 'enemy') return;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = 30 + Math.random() * 100;
      this.particles.push({
        x: entity.x,
        y: entity.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.3,
        color: entity.color,
      });
    }
    this.particles = this.particles.slice(-600);
  }

  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt);
    for (const [id, life] of this.flashes) {
      if (life <= dt) this.flashes.delete(id);
      else this.flashes.set(id, life - dt);
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  isHit(id: number): boolean {
    return this.flashes.has(id);
  }

  offset(): { x: number; y: number } {
    const magnitude = (this.shake / 0.18) * 4;
    return { x: (Math.random() - 0.5) * magnitude, y: (Math.random() - 0.5) * magnitude };
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }
}

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
      } else {
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
    this.toasts = this.toasts.filter((toast) => toast.remaining > 0);
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
