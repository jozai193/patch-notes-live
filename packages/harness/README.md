# Headless verification harness

```ts
import { verify } from '@patch-notes-live/harness';

const report = await verify(modSource); // string source, never a host module import
console.log(report.ok, report.checks, report.stats);
```

`verify(source, opts?)` is async because QuickJS WASM creation is async. It returns the requested Report. The only optional setting is an AbortSignal (`{ signal }`); seed count, tick count and safety thresholds cannot be reduced through options. Abort and infrastructure failures reject the promise; ordinary broken mods return a failed Report.

## CLI

```sh
npm run verify -- mods/samples/split-on-hit.js
npm run verify -- mods/samples/throws-on-tick.js --json
```

Exit codes: **0** pass, **1** failed mod verification, **2** usage/build/file/infrastructure error. Human summaries list each check and timing. With `--json`, stdout contains only the Report and the human summary goes to stderr. Npm itself prints a script preamble unless run with `--silent`:

```sh
npm run --silent verify -- mods/samples/split-on-hit.js --json
```

From a separate directory, invoke the launcher by its absolute path:

```powershell
node 'E:/Twitchcon hackathon/packages/harness/verify.mjs' ./mod.js --json
```

The launcher resolves the TypeScript compiler and its own module from import.meta.url. It incrementally builds only the harness and its project references before loading its trusted CLI implementation. The mod path remains relative to the caller's original directory. Workspace package imports resolve from the harness files, independently of the caller's working directory. The package also exposes the `harness verify <file> --json` bin form.

## Fixed checks

1. **load**: source is at most 8,192 UTF-8 bytes and QuickJS validates the ES-module export schema. A TypeScript AST traversal rejects literal `while(true)` statements, ignoring text in comments/strings. A small source containing such a loop is still simulated in the sandbox to produce its budget diagnosis; an oversized source is never executed.
2. **stability**: seeds 1, 2 and 3 each receive 3,600 tick calls with botIntent. Every independent run uses a fresh SandboxHost/WASM instance. The first fault (including disposal faults) and any disabled mod fail this check.
3. **budget**: no instruction-budget interrupts; peak polls are reported as a percentage of INSTRUCTION_BUDGET. Initialization/game-hook polls and the replay are included. Wall-clock timing is measured separately and does not alter deterministic budget decisions.
4. **runaway**: the entity count must not stay at the 300 cap for more than 300 consecutive live simulation ticks (five seconds). A dead/frozen world cannot manufacture extra capped time.
5. **winnable**: at least one seed survives 20 seconds, and none ends below five seconds. Survival is the engine's tick clock; it stops when the player dies.
6. **effect**: compare visible properties with a no-mod World using the exact same seed and intents, from initialization through tick 900 on all three seeds. Pass if any seed shows player max offset >=40px, mean enemy offset >=20px, entity count difference >=3, any entity color change, radius change >=2px, physics/arena changes, or at least one toast/tint. Match entities by ID and kind. Enemy offset is the mean across all matched-enemy observations in the complete window; player, count and radius offsets use maxima. Record all seed measurements even after a threshold passes. HP, RNG, tags, scratch state and imperceptible motion alone do not pass. Failure details give measurements and ask for a stronger effect within 10 seconds; the measurement window is 15 seconds. UI events are drained every tick on both the primary runs and replay, matching renderer consumption.
7. **determinism**: replay seed 1 using its recorded 3,600 intents, with a fresh sandbox, and compare final snapshot SHA-256 hashes. Timings, diagnostics and host bookkeeping are excluded from the hash.

There are four sandbox runs in total: three seeds and one seed-1 replay. A World freezes after game over; remaining tick calls still occur, but cannot advance survival time. Failure details explicitly identify tick attempts rather than claiming every dead run survived a full minute.

Every failure detail states the problem and a proposed repair. Ordinary QuickJS errors carry a bounded data-only stack, allowing `mod.js:line:column` diagnostics without invoking getters, coercion or VM object dumping. Uncatchable interrupts/allocation failures may have no safe stack; the report says so instead of inventing a location. The load check can still name the literal loop's AST location.

The Report is `{ ok, checks, stats, durationMs }`. Stats include survivalSecondsBySeed, maxEntities, peakBudgetPct, sandboxMsP95 and visibleEffectBySeed. The p95 uses per-live-tick summed sandbox call time across all four runs; zero-call ticks are included, so spawn/kill-only mods can have a zero p95. Verification duration includes AST scanning, WASM initialization, simulations, comparison, hashing and disposal. The CLI's incremental build/startup time is additional.

On the development laptop, all ten sample verifications completed below five seconds; the largest accumulation fixture took about 2.43 seconds in the test run. Timings are machine/workload measurements, not relaxed checks. No seed, tick count, entity cap or sandbox guard is weakened for the samples.
