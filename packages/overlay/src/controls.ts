import type { Arena, Intent } from '@patch-notes-live/engine';
import { aimAt } from './view.js';

export class Controls {
  private readonly keys = new Set<string>();
  private firing = false;
  private pointer = { x: 0, y: 0 };
  private hasPointer = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    actions: { toggleBot(): void; restart(): void },
  ) {
    window.addEventListener('keydown', (event) => {
      const key = event.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyB', 'KeyR'].includes(key)) event.preventDefault();
      this.keys.add(key);
      if (event.repeat) return;
      if (key === 'KeyB') actions.toggleBot();
      if (key === 'KeyR') actions.restart();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('pointermove', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
      this.hasPointer = true;
    });
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.firing = true;
      this.pointer = { x: event.clientX, y: event.clientY };
      this.hasPointer = true;
      canvas.setPointerCapture(event.pointerId);
    });
    window.addEventListener('pointerup', (event) => {
      if (event.button === 0) this.firing = false;
    });
    canvas.addEventListener('lostpointercapture', () => {
      this.firing = false;
    });
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  }

  reset(): void {
    this.keys.clear();
    this.firing = false;
  }

  intent(arena: Arena): Intent {
    const aim = this.hasPointer
      ? aimAt(this.pointer, this.canvas.getBoundingClientRect(), arena)
      : { x: arena.width / 2 + 1, y: arena.height / 2 };
    return {
      moveX: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
      moveY: Number(this.keys.has('KeyS')) - Number(this.keys.has('KeyW')),
      aimX: aim.x,
      aimY: aim.y,
      fire: this.firing,
    };
  }
}
