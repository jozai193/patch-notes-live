import type { Entity } from '@patch-notes-live/engine';

export type SpriteShape = NonNullable<Entity['shape']> | 'ship' | 'streak' | 'pool';
export function entityShape(e: Entity): SpriteShape {
  return (
    e.shape ??
    (e.kind === 'player'
      ? 'ship'
      : e.kind === 'enemy'
        ? e.radius <= 8
          ? 'triangle'
          : 'hex'
        : e.kind === 'pickup'
          ? 'diamond'
          : e.kind === 'hazard'
            ? 'pool'
            : 'streak')
  );
}
export function shapePath(ctx: CanvasRenderingContext2D, shape: SpriteShape, r: number): void {
  ctx.beginPath();
  if (shape === 'circle' || shape === 'pool') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    return;
  }
  if (shape === 'ship') {
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(-r, r * 0.85);
    ctx.lineTo(-r * 0.55, 0);
    ctx.lineTo(-r, -r * 0.85);
    ctx.closePath();
    return;
  }
  if (shape === 'streak') {
    ctx.roundRect(-r * 2, -r * 0.55, r * 3, r * 1.1, r * 0.5);
    return;
  }
  const points = shape === 'star' ? 10 : shape === 'hex' ? 6 : shape === 'triangle' ? 3 : 4;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 + (shape === 'square' ? Math.PI / 4 : 0);
    const radius = shape === 'star' && i % 2 ? r * 0.45 : r;
    const x = Math.cos(a) * radius,
      y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
interface Sprite {
  body: HTMLCanvasElement;
  halo: HTMLCanvasElement;
  extent: number;
  pixels: number;
}
/** Bounded LRU atlas: blur is baked once per geometry/color/rounded size, never per frame. */
export class SpriteCache {
  private readonly entries = new Map<string, Sprite>();
  private pixels = 0;
  get(shape: SpriteShape, color: string, radius: number): Sprite {
    const r = Math.max(1, Math.ceil(radius));
    const key = `${shape}/${color}/${r}`;
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return existing;
    }
    const extent = r * 2 + 16,
      size = extent * 2;
    const body = document.createElement('canvas'),
      halo = document.createElement('canvas');
    body.width = body.height = halo.width = halo.height = size;
    const b = body.getContext('2d')!,
      h = halo.getContext('2d')!;
    for (const ctx of [b, h]) {
      ctx.translate(extent, extent);
      ctx.lineJoin = 'round';
      shapePath(ctx, shape, r);
    }
    h.shadowBlur = Math.max(8, r * 0.85);
    h.shadowColor = color;
    h.strokeStyle = color;
    h.lineWidth = 3;
    h.stroke();
    h.stroke();
    b.fillStyle = color + '24';
    b.fill();
    b.strokeStyle = color;
    b.lineWidth = 1.6;
    b.stroke();
    b.scale(0.7, 0.7);
    shapePath(b, shape, r);
    b.strokeStyle = color + '80';
    b.lineWidth = 1;
    b.stroke();
    const sprite = { body, halo, extent, pixels: size * size * 2 };
    this.entries.set(key, sprite);
    this.pixels += sprite.pixels;
    while (this.entries.size > 192 || this.pixels > 4_000_000) {
      const oldest = this.entries.keys().next().value!;
      this.pixels -= this.entries.get(oldest)!.pixels;
      this.entries.delete(oldest);
    }
    return sprite;
  }
  draw(
    ctx: CanvasRenderingContext2D,
    shape: SpriteShape,
    color: string,
    radius: number,
    glow = 0.7,
  ): void {
    const sprite = this.get(shape, color, radius);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glow * 0.8;
    ctx.drawImage(sprite.halo, -sprite.extent, -sprite.extent);
    ctx.globalAlpha = 1;
    ctx.drawImage(sprite.body, -sprite.extent, -sprite.extent);
    ctx.restore();
  }
}
