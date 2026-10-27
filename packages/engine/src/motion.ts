import type { Entity, Physics, Vec } from './types.js';
import { clamp } from './validation.js';

export const ACCEL = 10;
export const GRAVITY_TERMINAL_SPEED = 150;

/** Keep accumulated gravity separate so steering does not cancel external acceleration. */
export class Motion {
  private readonly gravityVelocity = new Map<number, Vec>();

  reset(id: number, axis?: 'x' | 'y'): void {
    if (!axis) this.gravityVelocity.delete(id);
    else {
      const drift = this.gravityVelocity.get(id);
      if (drift) drift[axis] = 0;
    }
  }

  integrate(entity: Entity, desired: Vec | undefined, physics: Physics, dt: number): void {
    const drag = Math.exp(-physics.friction * dt);
    if (desired) {
      const drift = this.gravityVelocity.get(entity.id) ?? { x: 0, y: 0 };
      const steering = Math.min(1, ACCEL * dt);
      for (const [axis, velocity] of [
        ['x', 'vx'],
        ['y', 'vy'],
      ] as const) {
        let controlled = entity[velocity] - drift[axis];
        controlled += (desired[axis] - controlled) * steering;
        controlled *= drag;
        drift[axis] = clamp(
          (drift[axis] + physics.gravity[axis] * dt) * drag,
          -GRAVITY_TERMINAL_SPEED,
          GRAVITY_TERMINAL_SPEED,
        );
        entity[velocity] = clamp(controlled + drift[axis], -600, 600);
        // Account for the total velocity clamp without losing the controlled component.
        drift[axis] = entity[velocity] - controlled;
      }
      this.gravityVelocity.set(entity.id, drift);
    } else {
      entity.vx = clamp((entity.vx + physics.gravity.x * dt) * drag, -600, 600);
      entity.vy = clamp((entity.vy + physics.gravity.y * dt) * drag, -600, 600);
    }
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;
  }
}
