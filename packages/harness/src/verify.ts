import { INSTRUCTION_BUDGET } from '@patch-notes-live/mod-api';
import { literalLoops } from './static.js';
import { run, TICKS } from './run.js';
import { faultDetail } from './details.js';
import type { Check, CheckId, Report, VerifyOptions } from './types.js';

const IDS: CheckId[] = [
  'load',
  'stability',
  'budget',
  'runaway',
  'winnable',
  'effect',
  'determinism',
];

export async function verify(source: string, options: VerifyOptions = {}): Promise<Report> {
  const start = performance.now();
  options.signal?.throwIfAborted();
  const bytes = Buffer.byteLength(source, 'utf8');
  if (bytes > 8192) {
    return {
      ok: false,
      checks: IDS.map((id) => ({
        id,
        ok: false,
        detail:
          id === 'load'
            ? `Source is ${bytes} bytes; the maximum is 8192 (8 KB). Fix: remove unused code and shorten the module to 8 KB or less.`
            : `Not run because the source exceeds 8 KB. Fix: reduce source size and rerun verification.`,
      })),
      stats: { survivalSecondsBySeed: {}, maxEntities: 0, peakBudgetPct: 0, sandboxMsP95: 0 },
      durationMs: performance.now() - start,
    };
  }
  const loops = literalLoops(source);
  const first = await run(source, 1, options, undefined, true);
  const second = await run(source, 2, options, undefined, first.effectAt === undefined);
  const third = await run(
    source,
    3,
    options,
    undefined,
    first.effectAt === undefined && second.effectAt === undefined,
  );
  const repeated = await run(source, 1, options, first.intents);
  const primary = [first, second, third],
    all = [...primary, repeated];
  const failed = all.find((r) => r.firstFault || r.disabled);
  const loadFailure = all.find((r) => !r.loaded);
  const budgetFailure = all.find((r) => r.budgetFault);
  const peakPolls = Math.max(...all.map((r) => r.maxPolls));
  const peakBudgetPct = (peakPolls / INSTRUCTION_BUDGET) * 100;
  const runaway = all.find((r) => r.maxCappedTicks > 300);
  const early = primary.find((r) => r.survival < 5);
  const survived = primary.some((r) => r.survival >= 20);
  const effect = primary.find((r) => r.effectAt !== undefined);
  const samples = all.flatMap((r) => r.samples).sort((a, b) => a - b);
  const checks: Check[] = [
    {
      id: 'load',
      ok: all.every((r) => r.loaded) && loops.length === 0,
      detail: loadFailure
        ? `${loadFailure.firstFault ? faultDetail(loadFailure.firstFault, loadFailure.seed) : 'The module failed to load.'} Fix: correct the module export and syntax, then rerun.`
        : loops.length
          ? `Forbidden literal while(true) at mod.js:${loops[0]!.line}:${loops[0]!.column}. Fix: use a finite for loop or a per-tick state machine.`
          : `Valid ES-module export; ${bytes}/8192 bytes; no literal while(true).`,
    },
    {
      id: 'stability',
      ok: !failed,
      detail: failed?.firstFault
        ? faultDetail(failed.firstFault, failed.seed)
        : failed
          ? `Seed ${failed.seed}: the mod was disabled. Fix: remove the underlying sandbox fault and rerun all seeds.`
          : `Seeds 1, 2, 3 completed ${TICKS} tick attempts each, plus an independent seed-1 replay, with zero faults and no disabled mod.`,
    },
    {
      id: 'budget',
      ok: !budgetFailure && peakPolls <= INSTRUCTION_BUDGET,
      detail: budgetFailure?.budgetFault
        ? `${faultDetail(budgetFailure.budgetFault, budgetFailure.seed)} Peak: ${peakBudgetPct.toFixed(2)}% of the ${INSTRUCTION_BUDGET}-poll budget.`
        : peakPolls > INSTRUCTION_BUDGET
          ? `Peak ${peakPolls}/${INSTRUCTION_BUDGET} polls (${peakBudgetPct.toFixed(2)}%) exceeds the budget. Fix: reduce per-tick work and use bounded loops.`
          : `Peak ${peakPolls}/${INSTRUCTION_BUDGET} polls (${peakBudgetPct.toFixed(2)}%); no instruction-budget interrupts.`,
    },
    {
      id: 'runaway',
      ok: !runaway,
      detail: runaway
        ? `Seed ${runaway.seed}: entity count stayed at the 300 cap for ${(runaway.maxCappedTicks / 60).toFixed(2)} consecutive seconds (maximum 5). Fix: cap total spawns, give entities a lifetime, and remove old entities.`
        : `Longest consecutive time at the 300-entity cap: ${(Math.max(...all.map((r) => r.maxCappedTicks)) / 60).toFixed(2)} s (maximum 5).`,
    },
    {
      id: 'winnable',
      ok: survived && !early,
      detail: early
        ? `Seed ${early.seed} ended after ${early.survival.toFixed(2)} s, below the 5 s minimum. Fix: avoid setting player HP to zero, spawning lethal hazards on the player, or multiplying damage beyond survivable levels.`
        : !survived
          ? `No seed survived 20 s; survival was ${primary.map((r) => `${r.seed}: ${r.survival.toFixed(2)}s`).join(', ')}. Fix: reduce damage/enemy speed, provide healing, or leave safe movement routes.`
          : `Bot survived at least 20 s on a seed; all seed survival times: ${primary.map((r) => `${r.seed}: ${r.survival.toFixed(2)}s`).join(', ')}. No run ended under 5 s.`,
    },
    {
      id: 'effect',
      ok: !!effect,
      detail: effect
        ? `Seed ${effect.seed}: game snapshot differs from a no-mod baseline at tick ${effect.effectAt}, using the same seed and intents.`
        : `No snapshot difference from the no-mod baseline by tick 600 on seeds 1, 2, or 3. Fix: change a real entity/physics/arena/UI property or spawn an entity; private g.state changes alone are not a game effect.`,
    },
    {
      id: 'determinism',
      ok: first.hash === repeated.hash,
      detail:
        first.hash === repeated.hash
          ? `Independent seed-1 runs match: SHA-256 ${first.hash}.`
          : `Seed-1 snapshot hashes diverged (${first.hash} vs ${repeated.hash}) with the same intents. Fix: use g.rand()/game time only, avoid nondeterministic inputs, and correct any sandbox faults reported above.`,
    },
  ];
  return {
    ok: checks.every((c) => c.ok),
    checks,
    stats: {
      survivalSecondsBySeed: Object.fromEntries(primary.map((r) => [r.seed, r.survival])),
      maxEntities: Math.max(...all.map((r) => r.maxEntities)),
      peakBudgetPct,
      sandboxMsP95: samples.length ? samples[Math.ceil(samples.length * 0.95) - 1]! : 0,
    },
    durationMs: performance.now() - start,
  };
}
