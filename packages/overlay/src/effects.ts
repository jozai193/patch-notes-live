import type { Entity, Snapshot, UIEvent } from '@patch-notes-live/engine';
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}
interface Damage {
  x: number;
  y: number;
  text: string;
  life: number;
  player: boolean;
}
interface Trail {
  x: number;
  y: number;
  life: number;
  color: string;
  radius: number;
}
/** Entirely cosmetic. Never consumes engine randomness or changes a snapshot. */
export class Effects {
  private particles: Particle[] = [];
  private numbers: Damage[] = [];
  private trails: Trail[] = [];
  private readonly flashes = new Map<number, number>();
  private shake = 0;
  private wave = 0;
  private waveLife = 0;
  private combo = 0;
  private comboLife = 0;
  private rewriteLife = 0;
  private rewriteText = '';
  private rewriteRed = false;
  private channels: HTMLCanvasElement[] = [];
  observe(previous: Snapshot, current: Snapshot): void {
    const old = new Map(previous.entities.map((e) => [e.id, e]));
    const present = new Set(current.entities.map((e) => e.id));
    for (const e of current.entities) {
      const damage = (old.get(e.id)?.hp ?? e.hp) - e.hp;
      if (damage > 0) {
        this.flashes.set(e.id, 0.21);
        this.number(e, damage);
        if (e.kind === 'player') this.shake = 0.35;
      }
      if (e.kind === 'projectile' || (e.kind === 'player' && Math.hypot(e.vx, e.vy) > 10)) {
        this.trails.push({
          x: e.x,
          y: e.y,
          life: 0.2,
          color: e.color,
          radius: e.kind === 'player' ? 4 : 2,
        });
      }
    }
    for (const e of previous.entities)
      if (e.kind === 'enemy' && !present.has(e.id) && current.score > previous.score)
        this.number(e, e.hp);
    this.trails = this.trails.slice(-1000);
    if (current.wave !== this.wave) {
      this.wave = current.wave;
      this.waveLife = 2.1;
    }
  }
  private number(e: Entity, damage: number): void {
    this.numbers.push({
      x: e.x + (Math.random() - 0.5) * 18,
      y: e.y - e.radius - 10,
      text: `−${Math.ceil(damage)}`,
      life: 0.85,
      player: e.kind === 'player',
    });
    this.numbers = this.numbers.slice(-80);
  }
  burst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < Math.min(40, count); i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = 40 + Math.random() * 170,
        life = 0.25 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
      });
    }
    this.particles = this.particles.slice(-600);
  }
  accept(events: UIEvent[]): void {
    for (const e of events) if (e.type === 'burst') this.burst(e.x, e.y, e.color, e.count);
  }
  kill(e: Entity): void {
    if (e.kind !== 'enemy') return;
    this.burst(e.x, e.y, e.color, 18);
    this.combo = this.comboLife > 0 ? this.combo + 1 : 1;
    this.comboLife = 2.5;
  }
  rewrite(name: string, red = false): void {
    this.rewriteText = name.slice(0, 100);
    this.rewriteLife = 0.6;
    this.rewriteRed = red;
  }
  get rewriting(): boolean {
    return this.rewriteLife > 0;
  }
  update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt);
    this.waveLife = Math.max(0, this.waveLife - dt);
    this.comboLife = Math.max(0, this.comboLife - dt);
    this.rewriteLife = Math.max(0, this.rewriteLife - dt);
    for (const [id, life] of this.flashes) {
      if (life <= dt) this.flashes.delete(id);
      else this.flashes.set(id, life - dt);
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    for (const n of this.numbers) {
      n.y -= 55 * dt;
      n.life -= dt;
    }
    for (const t of this.trails) t.life -= dt;
    this.particles = this.particles.filter((p) => p.life > 0);
    this.numbers = this.numbers.filter((n) => n.life > 0);
    this.trails = this.trails.filter((t) => t.life > 0);
  }
  isHit(id: number): boolean {
    return this.flashes.has(id);
  }
  offset(): { x: number; y: number } {
    const m = (this.shake / 0.35) * 11;
    return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
  }
  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.trails) {
      ctx.globalAlpha = t.life * 1.8;
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, (t.radius * t.life) / 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px Consolas, monospace';
    for (const n of this.numbers) {
      ctx.globalAlpha = Math.min(1, n.life * 3);
      ctx.fillStyle = n.player ? '#ff617a' : '#ffffff';
      ctx.fillText(n.text, n.x, n.y);
    }
    ctx.restore();
  }
  drawHUD(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    ctx.textAlign = 'center';
    if (this.waveLife > 0) {
      ctx.globalAlpha = Math.min(1, this.waveLife, (2.1 - this.waveLife) * 5);
      ctx.fillStyle = '#48eaff';
      ctx.font = '12px Consolas, monospace';
      ctx.fillText('INCOMING TRANSMISSION', width / 2, 105);
      ctx.font = 'bold 38px Consolas, monospace';
      ctx.fillText(`WAVE ${String(this.wave).padStart(2, '0')}`, width / 2, 147);
    }
    if (this.comboLife > 0 && this.combo >= 2) {
      ctx.globalAlpha = Math.min(1, this.comboLife * 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffae57';
      ctx.font = 'bold 23px Consolas, monospace';
      ctx.fillText(`${this.combo}× COMBO`, width - 24, 40);
      ctx.font = '11px Consolas, monospace';
      ctx.fillText(
        this.combo >= 5 ? 'ABSOLUTELY UNNECESSARY.' : 'KEEP THE CHAIN ALIVE',
        width - 24,
        60,
      );
    }
    if (this.shake > 0) {
      ctx.fillStyle = `rgba(255,46,97,${this.shake * 0.3})`;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#ff4267';
      ctx.lineWidth = this.shake * 16;
      ctx.strokeRect(0, 0, width, height);
    }
    ctx.restore();
  }
  glitch(
    ctx: CanvasRenderingContext2D,
    buffer: HTMLCanvasElement,
    width: number,
    height: number,
  ): void {
    if (!this.rewriting) return;
    const strength = this.rewriteLife / 0.6,
      color = this.rewriteRed ? '#ff375f' : '#48eaff';
    // RGB-separated copies and horizontal tears come from a dedicated snapshot, never a self-copy.
    const b = buffer.getContext('2d')!;
    b.clearRect(0, 0, buffer.width, buffer.height);
    b.drawImage(ctx.canvas, 0, 0, buffer.width, buffer.height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.28 * strength;
    if (!this.channels.length)
      this.channels = [document.createElement('canvas'), document.createElement('canvas')];
    for (let i = 0; i < 2; i++) {
      const channel = this.channels[i]!;
      if (channel.width !== buffer.width) {
        channel.width = buffer.width;
        channel.height = buffer.height;
      }
      const c = channel.getContext('2d')!;
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, channel.width, channel.height);
      c.drawImage(buffer, 0, 0);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = i === 0 ? '#ff0000' : this.rewriteRed ? '#ff0000' : '#00ffff';
      c.fillRect(0, 0, channel.width, channel.height);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(buffer, 0, 0);
      ctx.drawImage(channel, (i === 0 ? -12 : 12) * strength, 0, width, height);
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.07 * strength;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.85 * strength;
    for (let i = 0; i < 6; i++) {
      const y = Math.random() * height,
        h = 3 + Math.random() * 13;
      ctx.drawImage(
        buffer,
        0,
        (y / height) * buffer.height,
        buffer.width,
        (h / height) * buffer.height,
        (Math.random() - 0.5) * 45 * strength,
        y,
        width,
        h,
      );
    }
    ctx.fillStyle = '#030817df';
    ctx.fillRect(0, height * 0.43, width, 88);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = this.rewriteRed ? '#ff687e' : '#b1f9ff';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText(
      this.rewriteRed ? 'ROLLING BACK REALITY' : 'REWRITING THE RULES',
      width / 2,
      height * 0.43 + 25,
    );
    ctx.font = 'bold 23px Consolas, monospace';
    ctx.fillText(this.rewriteText, width / 2, height * 0.43 + 58, width - 60);
    ctx.restore();
  }
}
