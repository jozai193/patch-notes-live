import type { ModHost } from './types.js';

/** Hosts share the engine's tracked Game facade; cancellation is sticky across the chain. */
export function composeHosts(...hosts: ModHost[]): ModHost {
  return {
    onStart(g) {
      for (const host of hosts) host.onStart?.(g);
    },
    onTick(g, dt) {
      for (const host of hosts) host.onTick?.(g, dt);
    },
    onSpawn(g, e) {
      for (const host of hosts) host.onSpawn?.(g, e);
    },
    onKill(g, e) {
      for (const host of hosts) host.onKill?.(g, e);
    },
    onHit(g, e) {
      let damage = e.damage,
        cancel = false;
      for (const host of hosts) {
        const result = host.onHit?.(g, { ...e, damage });
        if (typeof result?.damage === 'number' && Number.isFinite(result.damage))
          damage = result.damage;
        cancel ||= result?.cancel === true;
      }
      return { damage, cancel };
    },
  };
}
