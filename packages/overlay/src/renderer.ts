import type { Entity, Snapshot, Vec } from '@patch-notes-live/engine';
import { Effects } from './effects.js';
import { arenaView, CANVAS_HEIGHT, CANVAS_WIDTH } from './view.js';

function polygon(ctx: CanvasRenderingContext2D, sides: number, radius: number, angle = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = angle + (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius,
      y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  e: Entity,
  time: number,
  hit: boolean,
  aim: Vec,
) {
  const r = e.radius;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = e.color;
  ctx.strokeStyle = e.color;
  ctx.lineWidth = 2;
  if (e.kind === 'player') {
    ctx.save();
    ctx.rotate(Math.atan2(aim.y - e.y, aim.x - e.x));
    ctx.fillRect(4, -3, r + 8, 6);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    polygon(ctx, 6, r, Math.PI / 6);
    ctx.fill();
    ctx.fillStyle = '#132c2a';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'enemy') {
    polygon(ctx, 4, r + 2, Math.PI / 4);
    ctx.fill();
    ctx.strokeStyle = '#18201f';
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(4, 3);
    ctx.moveTo(4, -3);
    ctx.lineTo(-4, 3);
    ctx.stroke();
  } else if (e.kind === 'projectile') {
    ctx.rotate(Math.atan2(e.vy, e.vx));
    ctx.globalAlpha = 0.25;
    ctx.fillRect(-r * 4, -r / 2, r * 4, r);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (e.kind === 'pickup') {
    polygon(ctx, 4, r, 0);
    ctx.stroke();
    ctx.fillRect(-2, -6, 4, 12);
    ctx.fillRect(-6, -2, 12, 4);
  } else if (e.kind === 'hazard') {
    const pulse = 0.6 + Math.sin(time * 5) * 0.2;
    ctx.globalAlpha = pulse * 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, r + 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    polygon(ctx, 3, r, -Math.PI / 2);
    ctx.stroke();
    ctx.fillRect(-1.5, -r / 3, 3, r / 2);
    ctx.fillRect(-1.5, r / 3, 3, 3);
  }
  if (hit) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (e.hp < e.maxHp && e.hp > 0) {
    ctx.fillStyle = '#192c2a';
    ctx.fillRect(-r, -r - 10, r * 2, 4);
    ctx.fillStyle = e.color;
    ctx.fillRect(-r, -r - 10, (r * 2 * e.hp) / e.maxHp, 4);
  }
  ctx.restore();
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
    shake = effects.offset();
  ctx.save();
  ctx.translate(view.x + shake.x, view.y + shake.y);
  ctx.scale(view.scale, view.scale);
  const { width, height } = snapshot.arena;
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  if (!obs) {
    ctx.fillStyle = '#111e1f';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1c2c2d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 40) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#233334';
    ctx.font = '12px monospace';
    ctx.fillText('ARENA / 01', 20, 28);
    ctx.textAlign = 'right';
    ctx.fillText(`${width} × ${height}`, width - 20, height - 20);
    ctx.textAlign = 'left';
  }
  for (const e of snapshot.entities) drawEntity(ctx, e, time, effects.isHit(e.id), aim);
  effects.draw(ctx);
  if (!obs) {
    ctx.strokeStyle = '#85ead0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(aim.x, aim.y, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(aim.x - 11, aim.y);
    ctx.lineTo(aim.x - 4, aim.y);
    ctx.moveTo(aim.x + 4, aim.y);
    ctx.lineTo(aim.x + 11, aim.y);
    ctx.stroke();
  }
  ctx.restore();
}
