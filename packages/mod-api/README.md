# QuickJS mod host

`api.d.ts` is the standalone mod contract from PLAN.md. `src/contract-check.ts` checks its Game, Entity and hook signatures against the engine during `tsc -b`.

```ts
import { World, composeHosts } from '@patch-notes-live/engine';
import { SandboxHost, SPLIT_ON_HIT } from '@patch-notes-live/mod-api';

const host = await SandboxHost.create([SPLIT_ON_HIT]);
const world = new World(1, composeHosts(host, particleHost));
world.tick(intent);
console.log(host.mods, host.faults, host.isHealthy(0));
host.dispose();
```

Initialization is asynchronous to load WASM; hooks are synchronous. `SandboxHost.create(sources)` creates one completely separate WASM module instance per source. For explicit preloading use `new SandboxHost(await Promise.all(sources.map(() => loadQuickJS())), sources)`. Sharing a module between mods is rejected. Dispose the host when a run ends. Up to three sources are accepted, each exporting a default `{ name, description, hooks }` object. Accessor hooks and async hooks are rejected; imports are disabled.

## Deterministic instruction budget

Each mod has 64 QuickJS interrupt-handler polls per engine tick, summed across **all** its hook calls. Tick identity is `round(g.time * 60)`. Polls represent periodic interpreter checks, not individual JavaScript statements or a portable instruction count. The limit is fixed; measured wall time, machine speed and cold starts do not change ordinary success/failure decisions. There is no 2 ms post-call result-discard check.

A separate 50 ms emergency check applies to a single VM call. It checks at interpreter polls and after return. An emergency records a fault and permanently disables the mod; it never repeatedly drops a slow successful call and then retries it on the next tick. This is an exceptional safety backstop, not a determinism guarantee when the backstop fires. Native builtins that do not poll can still overshoot before returning; synchronous execution cannot forcibly preempt them.

The 600-tick calibration workload has 50 stationary enemies and three mods. Each mod changes player tags/friction in onTick, then modifies and cancels contact-hazard damage in onHit. The test verifies all 60 hit-hook calls, no faults, p95 sandbox time below 4 ms, and maximum polls below 10% of the instruction budget. A measured run used **1/64 polls (1.56%)** per mod per tick, at **0.292 ms mean / 0.686 ms p95** summed across mods. An isolated infinite loop hit the instruction limit in about **5.53 ms** on this laptop. These timings are measurements, not limits used in normal execution.

## Isolation, mutation and limits

- Only `quickjs-emscripten-core` and `@jitl/quickjs-wasmfile-release-sync` are installed. The overlay emits one release-sync WASM asset (503.13 kB, 235.94 kB gzip), rather than all four variants.
- Each mod gets its own WASM module, context, 16 MB QuickJS heap limit and 256 KB stack limit. An abort is confined to that module instance.
- After deterministic random/time and the log facade are installed, shared constructors/prototypes are frozen: Object, Array, Function, String, Number, Boolean, Map/Set/WeakMap/WeakSet, RegExp, Error classes, Promise and Date, plus JSON, Math and Reflect.
- Payloads contain time, player, event entities, physics and arena. `enemies()` and `entities()` fetch JSON lazily, once per list per hook. Copies share identity by ID within a call.
- The shim records mutations and spawn/remove/set/UI calls. The host validates the envelope and replays commands through the real engine Game facade. Entity ranges still use the engine validator; the engine enforces final physics/arena ranges, entity count and UI limits.
- Each call permits 1,000 commands and **32 spawn requests**. Exceeding the spawn limit faults the whole call before any of its spawns reach the world. Toast inputs exceeding **4,096 characters** fault before transfer; the engine still caps accepted display text at 80. The JSON result cap is 256 KB.
- Removing the player is rejected as a fault, including at the host command boundary. NaN/Infinity updates are rejected atomically.
- Temporary spawn IDs are remapped on the next hook, including retained spawn references. `g.state` persists only inside that mod's VM.
- `Math.random()` uses seeded `g.rand()`. `Date.now()` and no-argument `new Date()` use game time in milliseconds. During source initialization, time and random values are zero.
- Fetch, require, process, timers, WebAssembly, DOM and host object capabilities are absent. Native bridges carry only numbers, JSON and bounded strings, and are removed from VM globals after bootstrap.

## Errors, disable and disposal

The old error path called `vm.dump(result.error)`. That enters the native [QTS_Dump serializer](https://github.com/justjake/quickjs-emscripten/blob/v0.32.0/c/interface.c#L759-L792), which stringifies mod objects and reads properties during error processing. This reentrant serialization path is removed entirely, rather than relying on its native temporaries being cleaned up under pollution/interruption.

The shim catches ordinary errors and creates a primitive JSON message using captured intrinsics and an own **data** message descriptor. It never invokes thrown objects' `toJSON`, message getters or coercion methods. The host reads only string handles. Uncaught VM exceptions (such as interruption or allocation failure) are disposed without dumping or inspecting them; a generic fault is used when no safe message is available. Every returned result, exception, argument, namespace and install/shim handle has an explicit finally-disposal path.

Faults report `{ modName, hook, kind, message, tick }`. Three consecutive faulted calls or ten total disable the mod. Successful calls reset only the consecutive count. Load failures disable immediately because there is no usable hook table. Disabling adds one `kind: 'disabled'` notification; that notification does not increment the underlying fault count. Disabled mods are never invoked again. ModInfo exposes `disabled`, `disabledReason`, `faultCount`, `consecutiveFaults`, `disposed`, `interruptsThisTick`, `maxInterruptsPerTick`, and measured `timeThisTickMs`.

Console history retains 100 messages of 512 characters. Fault history retains 256 entries, while total counts remain cumulative. `isHealthy` requires zero faults and a mod that is neither disabled nor disposed. A fault drops that call's commands, but private VM state and earlier RNG requests are not rolled back. `dispose()` is idempotent: it attempts every cleanup operation, records failures as disposal faults, and never throws to its caller. It does not execute deferred promise jobs. Stream-level revert UI remains Step 8 work.

## Verification and overlay telemetry

```sh
npx tsc -b
npm test
npm run lint
npm run build -w @patch-notes-live/overlay
```

Full root `npm test` is required before committing. The old 1,200-tick hash test runs **20 times**, comparing two separate mod instances each run. Tests also cover cooperative interruption, cumulative polls, emergency disable, three/ten fault thresholds, separate WASM memories and injected cleanup failures.

`test/hostile.test.ts` runs each requested hostile mod for 120 bot-driven ticks, then disposes twice: Object/Array prototype pollution, recursion, catastrophic regex, a 5 MB toast, a 50-spawn onSpawn storm, player removal, NaN/Infinity physics, async hooks, accessor hooks and capability probes. It requires tick 120, a living player, no host throw, no disposal fault and disabled faulting mods. Additional thrown-error getter/toJSON tests verify the protected error transport.

Use `http://localhost:5173/?bot=1&mod=split-on-hit&seed=1&perf=1` for the live readout. FPS and frame p95 use the latest 300 frame intervals; sandbox mean/p95 uses the latest 300 actual simulation ticks, sums all active mods' calls and excludes rendering. The windows reset on restart. Diagnostics update four times per second and do not feed budget decisions.

Step 8.5 extends the backward-compatible contract with optional entity `shape` and `glow`, cosmetic `g.fx.burst` events (40 per call, 120 per engine tick across mods), and optional `patchNotes` metadata. The shim strips controls and caps notes at 140 characters; the wire validator rejects unsafe metadata. Visual rule fields are journaled and restored on removal.
