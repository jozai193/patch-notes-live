import type { Entity, Snapshot, Vec } from '@patch-notes-live/engine';
import { Effects } from './effects.js';
import { SpriteCache, entityShape } from './sprites.js';
import { arenaView, CANVAS_HEIGHT, CANVAS_WIDTH } from './view.js';
const sprites = new SpriteCache();
let glitchBuffer: HTMLCanvasElement | undefined;
let vignette: HTMLCanvasElement | undefined;
function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  time: number,
  hit: boolean,
  aim: Vec,
): void {
  const r = e.radius,
    angle =
      e.kind === 'player'
        ? Math.atan2(aim.y - e.y, aim.x - e.x)
        : e.kind === 'projectile'
          ? Math.atan2(e.vy, e.vx)
          : e.kind === 'pickup'
            ? time * 0.9
            : e.kind === 'enemy'
              ? Math.atan2(e.vy, e.vx)
              : 0;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(angle);
  if (e.kind === 'player') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = e.color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.33);
    ctx.lineTo(-r * (1.9 + Math.sin(time * 35) * 0.25), 0);
    ctx.lineTo(-r * 0.6, r * 0.33);
    ctx.fill();
    ctx.restore();
  }
  if (e.kind === 'projectile') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.moveTo(-r * 7, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.restore();
  }
  if (e.kind === 'hazard') {
    ctx.save();
    ctx.scale(1 + Math.sin(time * 3 + e.id) * 0.04, 1 + Math.cos(time * 3 + e.id) * 0.04);
    sprites.draw(ctx, entityShape(e), e.color, r, e.glow ?? 0.8);
    ctx.fillStyle = e.color + '38';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = e.color;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2,
        edge = r * (0.9 + 0.07 * Math.sin(a * 7 + time * 4) + 0.04 * Math.sin(a * 11 - time * 3));
      if (!i) ctx.moveTo(Math.cos(a) * edge, Math.sin(a) * edge);
      else ctx.lineTo(Math.cos(a) * edge, Math.sin(a) * edge);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.2, r * 0.1, r * 0.25, 0, Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
  } else sprites.draw(ctx, entityShape(e), e.color, r, e.glow ?? 0.7);
  if (e.kind === 'enemy') {
    ctx.fillStyle = e.color;
    ctx.globalAlpha = 0.45 + Math.sin(time * 6 + e.id) * 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.5, r * 0.25), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (e.kind === 'player') {
    ctx.fillStyle = '#e0ffff';
    ctx.beginPath();
    ctx.moveTo(r * 0.5, 0);
    ctx.lineTo(-r * 0.2, r * 0.23);
    ctx.lineTo(-r * 0.2, -r * 0.23);
    ctx.fill();
  }
  if (e.kind === 'pickup') {
    ctx.strokeStyle = '#effff5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-3, 0);
    ctx.lineTo(3, 0);
    ctx.moveTo(0, -3);
    ctx.lineTo(0, 3);
    ctx.stroke();
    const sparkle = r + 3 + Math.sin(time * 5) * 2;
    ctx.fillStyle = e.color;
    ctx.fillRect(sparkle, -1, 3, 2);
    ctx.fillRect(sparkle + 1, -2, 1, 4);
  }
  if (hit) {
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (e.hp < e.maxHp && e.hp > 0) {
    ctx.fillStyle = '#1a213c';
    ctx.fillRect(e.x - r, e.y - r - 9, r * 2, 3);
    ctx.fillStyle = e.color;
    ctx.fillRect(e.x - r, e.y - r - 9, (r * 2 * e.hp) / e.maxHp, 3);
  }
}
function background(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
): void {
  ctx.fillStyle = '#060b1c';
  ctx.fillRect(0, 0, width, height);
  const driftX = (time * 3) % 48,
    driftY = (time * 1.8) % 48;
  ctx.lineWidth = 0.65;
  ctx.strokeStyle = '#284e7370';
  ctx.beginPath();
  for (let x = -48 + driftX; x < width; x += 48) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = -48 + driftY; y < height; y += 48) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#23648855';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -240 + ((time * 3) % 240); x < width; x += 240) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = -240 + ((time * 1.8) % 240); y < height; y += 240) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.fillStyle = '#48eaff28';
  for (let i = 0; i < 22; i++) {
    const x = (i * 173.17 + time * 1.2) % width,
      y = (i * 257.43) % height;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}
function drawVignette(ctx: CanvasRenderingContext2D): void {
  if (!vignette) {
    vignette = document.createElement('canvas');
    vignette.width = CANVAS_WIDTH;
    vignette.height = CANVAS_HEIGHT;
    const c = vignette.getContext('2d')!;
    const g = c.createRadialGradient(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      70,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      CANVAS_WIDTH * 0.6,
    );
    g.addColorStop(0, '#04071800');
    g.addColorStop(0.6, '#02051210');
    g.addColorStop(1, '#01030be0');
    c.fillStyle = g;
    c.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
  ctx.drawImage(vignette, 0, 0);
}
export function render(
  ctx: CanvasRenderingContext2D,
  snapshot: Snapshot,
  effects: Effects,
  aim: Vec,
  obs: boolean,
  time: number,
): void {
  const dpr = ctx.canvas.width / CANVAS_WIDTH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const view = arenaView(snapshot.arena),
    shake = effects.offset(),
    { width, height } = snapshot.arena;
  if (!obs) {
    ctx.fillStyle = '#02040d';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    ctx.fillStyle = '#02040d88';
    const w = width * view.scale,
      h = height * view.scale;
    ctx.fillRect(0, 0, CANVAS_WIDTH, view.y);
    ctx.fillRect(0, view.y + h, CANVAS_WIDTH, CANVAS_HEIGHT - view.y - h);
    ctx.fillRect(0, view.y, view.x, h);
    ctx.fillRect(view.x + w, view.y, CANVAS_WIDTH - view.x - w, h);
  }
  ctx.save();
  ctx.translate(view.x + shake.x, view.y + shake.y);
  ctx.scale(view.scale, view.scale);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  if (!obs) background(ctx, width, height, time);
  for (const e of snapshot.entities)
    if (e.kind === 'hazard') drawEntity(ctx, e, time, effects.isHit(e.id), aim);
  for (const e of snapshot.entities)
    if (e.kind !== 'hazard') drawEntity(ctx, e, time, effects.isHit(e.id), aim);
  effects.draw(ctx);
  if (!obs) {
    ctx.strokeStyle = '#48eaff99';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 7, 0, Math.PI * 2);
    ctx.moveTo(aim.x - 12, aim.y);
    ctx.lineTo(aim.x - 4, aim.y);
    ctx.moveTo(aim.x + 4, aim.y);
    ctx.lineTo(aim.x + 12, aim.y);
    ctx.moveTo(aim.x, aim.y - 12);
    ctx.lineTo(aim.x, aim.y - 4);
    ctx.moveTo(aim.x, aim.y + 4);
    ctx.lineTo(aim.x, aim.y + 12);
    ctx.stroke();
  }
  ctx.restore();
  if (!obs) drawVignette(ctx);
  // Fixed base scale: smaller walls close in, never zoom the entities.
  ctx.save();
  ctx.translate(view.x + shake.x, view.y + shake.y);
  ctx.scale(view.scale, view.scale);
  ctx.strokeStyle = snapshot.arena.wrap ? '#b395ff99' : '#48eaff77';
  ctx.lineWidth = 1.5 / view.scale;
  if (snapshot.arena.wrap) ctx.setLineDash([7 / view.scale, 7 / view.scale]);
  ctx.strokeRect(1, 1, width - 2, height - 2);
  if (!obs) {
    ctx.fillStyle = '#718ba9';
    ctx.font = '12px Consolas, monospace';
    ctx.fillText('SECTOR / 001', 18, 27);
    ctx.textAlign = 'right';
    ctx.fillText(
      `${Math.round(width)} × ${Math.round(height)}${snapshot.arena.wrap ? ' / WRAP' : ''}`,
      width - 18,
      height - 18,
    );
  }
  ctx.restore();
  effects.drawHUD(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (effects.rewriting) {
    glitchBuffer ??= document.createElement('canvas');
    if (glitchBuffer.width !== CANVAS_WIDTH) {
      glitchBuffer.width = CANVAS_WIDTH;
      glitchBuffer.height = CANVAS_HEIGHT;
    }
    effects.glitch(ctx, glitchBuffer, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
}
