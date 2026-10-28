import type { Fault } from '@patch-notes-live/mod-api';

export function faultDetail(fault: Fault, seed: number): string {
  const location = fault.stack?.match(/mod\.js:\d+:\d+/)?.[0];
  const where = location ? ` at ${location}` : ' (no safe mod.js location available)';
  let fix = 'Use only the documented Game API, validate values, and keep each hook bounded.';
  if (fault.kind === 'interrupt')
    fix =
      'Replace unbounded loops with a small bounded loop; avoid scanning all entities in every hook and stagger expensive work across ticks.';
  else if (fault.kind === 'memory')
    fix =
      'Bound g.state arrays/maps and reuse or remove old entries instead of retaining objects indefinitely.';
  else if (fault.kind === 'emergency')
    fix =
      'Remove expensive native operations and split work across ticks; the single-call emergency limit is 50 ms.';
  else if (/undefined|cannot read|cannot set/i.test(fault.message))
    fix =
      'g.enemies() returns an array; check its length before indexing and check optional event fields before reading them.';
  else if (/spawn|command limit/i.test(fault.message))
    fix =
      'Limit spawn batches and stop spawning when enough entities already exist; use g.state for a finite spawn counter.';
  else if (/synchronous/i.test(fault.message))
    fix = 'Use a synchronous hook; do not declare it async or return a Promise.';
  else if (fault.hook === 'load')
    fix =
      'Export default { name, description, hooks }; use valid ES-module JavaScript and ordinary synchronous hook methods.';
  const type = fault.errorName ? `${fault.errorName}: ` : '';
  return `Seed ${seed}, tick ${fault.tick}: ${fault.hook} ${fault.kind}: ${type}${fault.message}${where}. Fix: ${fix}`;
}
