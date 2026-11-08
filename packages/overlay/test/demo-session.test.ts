import { expect, it } from 'vitest';
import { DemoSession } from '../src/demo-session.js';
import { World, composeHosts, IDLE_INTENT } from '@patch-notes-live/engine';
it('typing assistance restores the existing autopilot choice on blur', () => {
  for (const initial of [false, true]) {
    const session = new DemoSession(initial);
    session.typing = true;
    expect(session.drivesPlayer).toBe(true);
    session.typing = false;
    expect(session.drivesPlayer).toBe(initial);
    expect(session.autopilot).toBe(initial);
  }
});
it('standalone patch grace cancels damage for 180 ticks, expires, and never affects a connected game', () => {
  const demo = new DemoSession();
  demo.patchApplied(0);
  const world = new World(
    1,
    composeHosts(demo.host, {
      onStart(g) {
        g.spawn('hazard', { x: g.player.x, y: g.player.y, radius: 40 });
      },
    }),
  );
  for (let i = 0; i < 179; i++) world.tick(IDLE_INTENT);
  expect(world.snapshot().player.hp).toBe(100);
  expect(demo.protected(179)).toBe(true);
  expect(demo.protected(180)).toBe(false);
  for (let i = 0; i < 31; i++) world.tick(IDLE_INTENT);
  expect(world.snapshot().player.hp).toBeLessThan(100);
  demo.connected = true;
  demo.patchApplied(300);
  expect(demo.protected(301)).toBe(false);
});
