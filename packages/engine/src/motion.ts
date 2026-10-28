import type { Entity, Physics, Vec } from './types.js';
import { clamp } from './validation.js';

export const ACCEL = 10;
export const GRAVITY_TERMINAL_SPEED = 150;
// Near 1.5/s, calibrated to retain >=100px of drift in 1s under gravity.y=300.
export const EXTERNAL_DAMPING = 1.3;

/** Steering never cancels gravity or mod pushes; both share capped, damped external drift. */
export class Motion {
  private readonly externalVelocity = new Map<number, Vec>();

  reset(id: number, axis?: 'x' | 'y'): void {
    if (!axis) this.externalVelocity.delete(id);
    else {
      const drift = this.externalVelocity.get(id);
      if (drift) drift[axis] = 0;
    }
  }

  setVelocity(entity: Entity, axis: 'x' | 'y', value: number): void {
    const velocity = axis === 'x' ? 'vx' : 'vy';
    if (entity.kind !== 'player' && entity.kind !== 'enemy') {
      entity[velocity] = value;
      return;
    }
    const drift = this.externalVelocity.get(entity.id) ?? { x: 0, y: 0 };
    const controlled = entity[velocity] - drift[axis];
    drift[axis] = clamp(
      drift[axis] + value - entity[velocity],
      -GRAVITY_TERMINAL_SPEED,
      GRAVITY_TERMINAL_SPEED,
    );
    entity[velocity] = clamp(controlled + drift[axis], -600, 600);
    this.externalVelocity.set(entity.id, drift);
  }

  integrate(entity: Entity, desired: Vec | undefined, physics: Physics, dt: number): void {
    const drag = Math.exp(-physics.friction * dt);
    if (desired) {
      const drift = this.externalVelocity.get(entity.id) ?? { x: 0, y: 0 };
      const externalDrag = Math.exp(-(physics.friction + EXTERNAL_DAMPING) * dt);
      const steering = Math.min(1, ACCEL * dt);
      for (const [axis, velocity] of [
        ['x', 'vx'],
        ['y', 'vy'],
      ] as const) {
        let controlled = entity[velocity] - drift[axis];
        controlled += (desired[axis] - controlled) * steering;
        controlled *= drag;
        drift[axis] = clamp(
          (drift[axis] + physics.gravity[axis] * dt) * externalDrag,
          -GRAVITY_TERMINAL_SPEED,
          GRAVITY_TERMINAL_SPEED,
        );
        entity[velocity] = clamp(controlled + drift[axis], -600, 600);
        // Account for the total velocity clamp without losing the controlled component.
        drift[axis] = entity[velocity] - controlled;
      }
      this.externalVelocity.set(entity.id, drift);
    } else {
      entity.vx = clamp((entity.vx + physics.gravity.x * dt) * drag, -600, 600);
      entity.vy = clamp((entity.vy + physics.gravity.y * dt) * drag, -600, 600);
    }
    entity.x += entity.vx * dt;
    entity.y += entity.vy * dt;
  }
}
