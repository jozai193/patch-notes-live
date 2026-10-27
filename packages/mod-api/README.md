# QuickJS mod host

`api.d.ts` is the standalone mod contract from PLAN.md. `src/contract-check.ts` checks its Game, Entity and hook signatures against the engine during `tsc -b`.

```ts
import { World, composeHosts } from '@patch-notes-live/engine';
import { SandboxHost, SPLIT_ON_HIT } from '@patch-notes-live/mod-api';

const host = await SandboxHost.create([SPLIT_ON_HIT]);
const world = new World(1, composeHosts(host, particleHost));
world.tick(intent);
console.log(host.mods, host.faults, host.isHealthy(0));
host.dispose(); // Release every context, handle and runtime when the run ends.
```

Initialization is asynchronous to load WASM. Hook execution is synchronous. Callers that preload WASM can use `new SandboxHost(await loadQuickJS(), sources)`. Up to three sources are accepted. Each must export a default `{ name, description, hooks }` object; hooks must return synchronously. Imports are disabled.

## Isolation and command boundary

- Explicit `RELEASE_SYNC` variant, one context and separate runtime per mod.
- 16 MB QuickJS heap limit and 256 KB stack limit per runtime.
- A cumulative 2 ms wall-clock budget per mod per engine tick, shared across all hooks, marshalling and replay. Tick identity comes from `round(g.time * 60)`. Loading/validating source has a separate 50 ms interrupt deadline.
- Payloads contain time, player, event entities, physics and arena. `enemies()` and `entities()` call native bridges only when read, with each list cached inside that hook. Copies are shared by ID within the VM invocation.
- The shim records spawn/remove/set/UI calls and known entity-field changes. The host validates the result shape, then calls the real Game methods. Entity field validation uses the engine's exported validator, with the engine still enforcing final physics/arena ranges, entity count and UI limits.
- Spawn commands use temporary IDs; host IDs are sent back on the next hook and update retained spawn references. This lets commands target a just-spawned entity without exposing a live host object.
- `g.state` persists inside each mod's VM. It is not shared with other mods or the engine's scratch state.
- `Math.random()` delegates to seeded `g.rand()`. `Date.now()` and no-argument `new Date()` use game time in milliseconds. Source initialization has game time zero and random value zero; seeded randomness is available inside hooks.
- There is no fetch, module loader, Node process, DOM, timer or host object capability. The three private bridges carry only numbers/JSON/log strings and are removed from the VM global object after bootstrap.

The command cap is 1,000 per hook, the JSON result cap is 256 KB, and console output retains at most 100 messages of 512 characters. Fault history retains the newest 256 entries; per-mod fault counts remain cumulative. Errors report `{ modName, hook, kind, message, tick }`. A fault discards that call's commands, but does not roll back private VM state or previously requested RNG values. Calls resume on the next tick; automatic watchdog/revert behavior belongs to Step 8. `isHealthy` means the mod has had zero faults since creation.

## Timing limits

QuickJS interrupt checks are cooperative. Bytecode loops are interrupted promptly, but a native builtin such as a large `Array.fill()` can overshoot the deadline before returning. A probe allocating/filling a million-element array took about 152 ms before the post-call budget check; an oversized array hit the memory cap and returned an out-of-memory fault in about 22 ms. The 2 ms budget is therefore not a hard real-time guarantee for arbitrary native builtins. Post-call checks record overruns and discard their command results. Moving execution into a worker would provide stronger UI isolation, but would require a different asynchronous engine integration and is outside this synchronous Step 3 design.

Cold full-list calls also matter: an initial 50-entity lazy-read benchmark measured approximately 1.6 ms mean / 2.3 ms p95 in total, but some individual cold calls exceeded a mod's 2 ms budget. Keep per-tick mods focused and use spawn/hit hooks when possible. This observation is not hidden by the lighter acceptance workload below.

## Verification

```sh
npx tsc -b
npm test
npm run lint
npm run build -w @patch-notes-live/overlay
```

Node tests cover gravity and entity changes, explicit setters, event changes, cancellation/damage chaining, lazy reads, per-mod state, five representative sample behaviors, exceptions, infinite loops, allocation failure, missing capabilities, invalid results, cumulative budgets and 1,200-tick snapshot determinism.

The performance test keeps 50 stationary enemies for 600 measured ticks, with three active mods. Every mod changes player tags and friction in `onTick`, and changes/cancels damage in `onHit`; a contact hazard exercises 20 hit calls per mod (60 total). It asserts zero faults and p95 sandbox time below 4 ms. Timings sum the measured time in all mod calls each tick, including serialization, VM execution and command replay; they exclude engine physics, rendering and WASM initialization. `npm test` prints the measured mean and p95 on the current machine.

Browser checks exercised real split children, restart and an interrupted infinite loop. A separate browser run with 50 enemies and three mods rendered 180 frames at about 6.94 ms mean / 7.10 ms p95 intervals, with zero sandbox faults on this laptop. These are workload measurements, not guarantees for arbitrary generated code.
