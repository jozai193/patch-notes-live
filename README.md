# Patch Notes Live

Steps 1–8.5 implement the deterministic game, playable overlay, QuickJS sandbox, verifier, patch-generation CLI, benchmark, live WebSocket hot-swap/watchdog, and procedural neon art. See [PLAN.md](PLAN.md) for later build steps.

Current targets: Next Byte Hacks V5 (November 7, 5 PM EST; innovation, technical complexity, execution/polish and presentation weighted equally), then Arbiter Hacks V1 General (December 20). Twitch is optional; the in-game rule box is the next planned step.

## Play locally

Use Node 24 and npm:

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The root command starts both the overlay and local WebSocket hub on port 8787, building trusted server code first. `npm run dev -w @patch-notes-live/overlay` starts only the overlay, which remains playable without a hub and reconnects with backoff when one appears. Vite imports engine/mod-api TypeScript source through aliases, so no engine build is needed for standalone play.

Move with **WASD**, aim with the **mouse**, and hold **left click** to fire. Press **B** or click Autopilot to toggle the bot. Press **R** at any time, or click Restart Run after game over, to restart with the same seed and active patches. Their VM state and onStart reset; patch versions and remaining lifetimes are retained. Focus the game window to use the keyboard. Controls reset on blur; hidden tabs pause simulation instead of accumulating a catch-up backlog.

- `?seed=42` selects a deterministic seed (default 1).
- `?bot=1` starts with autopilot on.
- `?obs=1` makes the page and arena background transparent and hides the cursor.
- `?mod=split-on-hit` loads the sandboxed demo mod; enemies split into two smaller enemies when shot. Try [the demo with autopilot](http://localhost:5173/?bot=1&mod=split-on-hit&seed=1).
- `?perf=1` shows fps, frame interval p95, and sandbox time per tick (mean/p95), with rolling windows of 300 frames and 300 simulation ticks. Timings are diagnostic and never control normal mod execution.
- `?server=ws://localhost:8787` overrides the hub URL; `?server=off` explicitly runs standalone.
- `?patchLifetime=120` configures patch lifetime in wall-clock seconds (1–3600, default 120).
- Combine them: [OBS + bot, seed 1](http://localhost:5173/?obs=1&bot=1&seed=1).

The 1280×720 stage scales to fit the window, with a 960×600 canvas and a narrow 252px status panel. Neon sprites are procedural: a bounded offscreen atlas bakes glow per shape/color/size and composites it additively; no external art or per-entity frame-time shadow blur. Trails, kill particles, damage numbers, combos and wave banners are render-only. A live patch gets a 600ms RGB rewrite before its card; reverts get a red rewrite.

Arena rendering keeps a fixed scale based on the base 960×640 arena: smaller arenas are centered against a dim void, while larger arenas scale down to fit. Rounded labels show arena size; a dashed wall marks wrap mode. Rendering interpolates fixed 60 Hz snapshots. Cosmetic randomness does not consume the engine RNG. The HUD shows HP, wave, score, time and patch version. Active patches show name, author and countdown; particle hooks compose alongside the sandbox.

## Add to OBS

1. Keep the local dev server running.
2. In OBS Sources, add a **Browser** source.
3. Set URL to `http://localhost:5173/?obs=1&bot=1&seed=1`, width **1280**, height **720**, and frame rate **60**.
4. Place the source above your scene or camera; the arena backdrop is transparent. Use **Interact** on the Browser source to give the game keyboard/mouse input, or leave bot mode enabled.
5. Refresh the Browser source to begin a new session. R restarts after game over without reloading.

To build the overlay for static hosting:

```sh
npm run build -w @patch-notes-live/overlay
```

The output is `packages/overlay/dist/`. Live patch loading is available now; Twitch integration remains a later step.

## Local checks

Use Node 24 and npm:

```sh
npm install
npx tsc -b
npm test
npm run lint
npm run format
npm run verify -- mods/samples/split-on-hit.js
```

The root test script runs every workspace. Server pipeline tests inject a fake Codex runner and run the real independent verifier; npm test never invokes real Codex or needs credentials. TypeScript builds use strict mode, ESM and project references. Only the overlay includes DOM libraries; the harness and server have Node typings. Engine compilation has only the ES2022 library, with no DOM or ambient Node types. Overlay type-check output goes to `dist-types/`, separate from the Vite production bundle. No credentials are needed for Steps 1–5.

## Verify a mod

Run `npm run verify -- <file> [--json]`. Exit codes are 0 for pass, 1 for a failed mod and 2 for a harness/usage error. JSON goes to stdout and the readable summary to stderr; use `npm run --silent verify -- <file> --json` when parsing npm's output.

The verifier checks load/size, three-seed stability, instruction budget, runaway entity accumulation, bot survival, observable effect against an identical-input baseline, and independent seed-1 replay determinism. Every run uses a fresh sandbox. See [harness usage and report semantics](packages/harness/README.md) and [the sample module catalog](mods/samples/README.md).

From a patch workspace outside the repository, run the CLI by absolute path; relative mod paths resolve in that workspace:

```powershell
node 'E:/Twitchcon hackathon/packages/harness/verify.mjs' ./mod.js --json
```

## Generate a runtime patch (Step 6)

Authenticate once with `codex login` (Codex CLI), or provide `CODEX_API_KEY` in your environment or the ignored root `.env` file. No Twitch or embeddings key is needed. The SDK uses its bundled CLI; its installed TypeScript definitions are authoritative. Optional `.env` settings `PATCH_CODEX_MODEL` and `PATCH_CODEX_REASONING=low` select a model and low/medium reasoning; leaving the model empty uses your Codex configuration.

```sh
npm run patch -- "enemies split in two when hit"
```

The command builds trusted server/harness code and copies the canonical `packages/mod-api/api.d.ts` into the generated template API file. `npm run build` also prepares that copy; it is ignored by Git rather than maintained separately. Each patch gets a fresh temporary directory at `os.tmpdir()/patch-notes-live/patch-<id>`, outside the repository, so the developer AGENTS.md is not inherited. Its package.json test command contains absolute Node and harness paths; the prebuilt `verify-built.mjs` entry point reads trusted code without rebuilding outside the sandbox.

Viewer text is normalized, capped at 200 Unicode characters, and written only as quoted data in REQUEST.md. The SDK receives a fixed instruction to read it, with workspace-write sandboxing, networking and web search disabled, and approvals forbidden. No repository directory is added as writable. Protected template files are checked after each turn; unexpected files and directories are removed before verification. The model may edit mod.js or write result.json to reject a non-rule/impossible request.

Compile-feed messages describe phases without forwarding raw reasoning, commands or model output. A separate in-process `verify()` checks the actual source. A failed report gets one retry in the same thread within a 150-second total timeout. Cancellation and timeout abort the runner. Cleanup is attempted on every outcome; cleanup errors are logged without discarding valid results. Usage-limit errors return `quota` immediately, without retry. Status is `ok`, `failed`, `rejected`, `timeout`, or `quota`, with attempts, thread ID, independent report and duration. Exit codes: 0 success, 1 failed/rejected, 124 timeout, 2 CLI/setup error.

Verified mods and matching `.report.json` files are saved in `mods/generated/<slug>-<timestamp>.*`. They are source strings for QuickJS; do not import or execute them in Node. Add `--apply` to push a successful generation through the live hub's independent verification.

See [the recorded Step 6 validation](docs/step-6-validation.md) for full command outputs, real request statuses and durations.

## Benchmark generated patches (Step 7)

Use the same Codex authentication and model settings as the patch CLI:

```sh
npm run bench -- --only 0-5
npm run bench -- --only 6-19 --concurrency 2
```

The fixed catalog has exactly 20 cases; cases 5 and 19 must be rejected. With no `--only`, the command selects all 20. Concurrency defaults to 2; indices, ascending ranges and comma-separated selections are accepted. Follow the staged gate: run cases 0–5 first and run 6–19 only if at least four match their expected statuses. A quota result stops the whole benchmark immediately, aborts active siblings and prevents any further cases from starting.

Each invocation creates `bench-results/<timestamp>/` (ignored by Git, lint and formatting) with source files, full independent `.report.json` files, `output.log` and an incrementally saved `summary.json`. Failed verifications retain their source for diagnosis; rejected/cancelled runs may have no source. Per-case records include status, expected-status match, duration, attempts, first failed check, per-seed visible-effect measurements, reason and thread ID. Stored source strings are never imported or executed in Node.

The summary reports game-rule pass rate, correct rejections, false rejections/acceptances, median/p90 duration and retries used. Median/p90 include all completed rule and rejection cases; p90 uses nearest rank. Quota and cancelled siblings are excluded from completed quality/latency measurements, with unstarted cases listed explicitly. Retries count all second attempts used. A quota-stopped run is incomplete and cannot establish GO/NO-GO. Exit codes: 0 all expected statuses matched, 1 a mismatch, 75 quota, 130 user cancellation, 2 setup/infrastructure error. Benchmark tests use fakes and never invoke real Codex.

## Live patches and watchdog (Step 8)

With `npm run dev` running:

```sh
npm run patch:apply -- mods/samples/split-on-hit.js --author local
npm run patch:revert -- <patchId>
npm run patch -- "enemies split in two when hit" --apply
```

The apply CLI prints the patch ID after the hub independently verifies and accepts the source. The overlay acknowledges actual activation at the next tick and shows `PATCH NOTES vX.Y: <name> by <author>`. A fourth patch expires the oldest; patches also expire after their lifetime. Reverts display a separate red banner. Version starts at v1.0 and increases by 0.1 for each accepted application; expiry/revert does not decrement it. Expired/reverted IDs are remembered across reconnects to prevent accidental reapplication.

The hub binds only to loopback. `PORT` changes its port; CLI `PATCH_SERVER_URL` defaults to that port on 127.0.0.1. The overlay URL can be set with `?server=`. WebSocket messages carry `v: 1` and pass shared handwritten validators, with bounded metadata, UTF-8 source size, telemetry values and active-patch counts. Server→overlay messages are hello (current patches), applyPatch and revertPatch. Overlay→server messages are hello, patchApplied, patchReverted and telemetry every second (`fps`, `frameP95`, `sandboxP95`, `activePatches`). Controllers use hello, applyRequest/revertRequest and correlated result messages. Unknown fields/versions, malformed messages and role violations are refused. No Twitch or Codex credentials are needed for the hub or file-based live application.

Every active patch owns a separate WASM/runtime/context with the existing memory, stack, deterministic instruction and fault limits. The watchdog removes auto-disabled patches using their first fault message; it also removes a patch with p95 sandbox time over 4 ms in a full three-second sampling window (at least 120 live samples). This live performance watchdog uses wall-clock telemetry; deterministic instruction enforcement remains unchanged. Missing/background simulation samples cannot create an instantaneous slow-patch verdict.

Removal disposes the VM immediately. On the next tick, an ownership journal restores rule fields (radius, speed, color, tags, max HP, physics, arena) to the remaining patch layer or base value, and removes entities spawned by that patch. It does not rewind movement, damage, healing, score or elapsed time; pushes fade under normal drift damping. Re-running onStart during restart uses a fresh VM for each retained patch.

```sh
npm run patch:apply -- mods/samples/time-bomb.js
```

Apply this early in a fresh bot run. It passes the fixed 60-second verifier, then throws after **game time** 70 seconds. Three consecutive throws auto-disable it; the watchdog reverts it around 70.05 s with the red fault banner. This demonstrates the finite verification horizon and the live backstop. `--apply` generation tests use a fake Codex runner; normal npm tests never spend real Codex calls.

## Engine

```ts
import { World, botIntent } from '@patch-notes-live/engine';

const world = new World(1);
for (let i = 0; i < 1200; i++) world.tick(botIntent(world.snapshot()));
const frame = world.snapshot();
```

One `tick(intent)` advances 1/60 second. Movement components are normalized to length at most one; aim is an absolute arena point. Player and enemy controlled velocity steers toward desired movement with `min(1, 10 * dt)`. Gravity and mod pushes share external drift, capped at 150 px/s per axis so the player can fight sustained gravity. On player/enemy entities, velocity commands add their delta to external drift instead of controlled movement. Drift has base damping of 1.3/s plus physics.friction; controlled movement uses physics.friction. This damping is calibrated near 1.5/s while preserving at least 100 pixels of gravity movement: gravity of 300 moves an idle player 100.30 pixels in 60 ticks at zero friction. Boundary stops reset the corresponding drift component. Unsteered entities retain direct velocity commands. Time, wave scheduling, weapon cooldowns and projectile expiry use the integer tick clock. `timeScale` scales movement integration, not this clock. Dead worlds stop advancing. Snapshots are detached serializable rendering/mod inputs, not save-state restoration records.

Waves start at tick 1, then 120 ticks after the last enemy is cleared or 600 ticks after the previous wave began, whichever comes first, with increasing counts and speed. The bot seeks the nearest pickup below 60% HP when no enemy is within 150 pixels of that path. `composeHosts(...hosts)` chains hooks in order; onHit damage flows through the chain and any cancellation wins. Enemies chase the player. Projectiles deal damage and expire after 120 ticks. Enemy deaths award points and can drop healing pickups. Hazards and enemies deal contact damage at most once per 30 ticks per attacker. Movement wraps when enabled; collisions use circle overlap at current arena coordinates. The uniform grid inserts all cells touched by each circle and deduplicates candidate pairs.

## Sandbox adapter boundary

`ModHost` has the hook signatures from PLAN.md; the default host does nothing. Untrusted mod source runs exclusively in `SandboxHost` inside QuickJS. Each mod has its own release-sync WASM instance, 16 MB runtime, frozen shared intrinsics and a deterministic limit of 64 interrupt-handler polls per tick. A mod is disabled after three consecutive faulted calls or ten total; a 50 ms emergency single-call overrun disables it immediately. See [the sandbox notes](packages/mod-api/README.md) for error handling, limits and measurements. Large native builtins remain cooperatively interruptible; the emergency backstop cannot preempt operations that do not poll until they return.

Initialization calls `onStart` before spawn notifications. Each live tick calls `onTick`, creates a scheduled wave and projectiles, integrates movement, resolves collisions (`onHit` before damage and `onKill` after death), then drains remaining spawn notifications. `onSpawn` receives detached entities. Hook-generated spawn chains are bounded at 1,000 notifications per drain.

Game entity reads are detached and shared by entity ID within each hook invocation. After the hook returns, changes to known mutable fields are diffed into validated `setEntity` commands. This includes `g.player`, `enemies()`/`entities()` results, hook event arguments and `spawn()` return values. Unknown properties are ignored; ID and kind remain immutable. `g.set(entity, fields)` applies validated changes to the tracked copy, so subsequent reads and assignments in the same hook see them. Spawn commands run before mutation diffs; removed entities are not recreated by a diff. Invalid field batches are rejected. Copies retained beyond a hook invocation cannot directly change the world. Game spawn/remove/UI methods queue validated commands. Physics and arena changes are collected after each hook. The sandbox keeps per-mod state private in each VM and marshals its mutations through these same engine methods.

`applyCommands` accepts untrusted parsed data and returns an acceptance flag per command. Invalid commands are rejected atomically. At most 1,000 commands per batch and 300 entities are accepted; the player cannot be removed. IDs and kinds cannot be changed. UI events retain the newest 32 entries across ticks. Snapshots read them without consuming them; the overlay calls `world.drainEvents()` once per frame. Events submitted between ticks remain available until drained or displaced by the cap.

| Field                | Accepted range/format                     |
| -------------------- | ----------------------------------------- |
| x, y                 | -4096–4096, then bounded/wrapped to arena |
| vx, vy               | -600–600                                  |
| radius               | 1–64                                      |
| hp / maxHp           | 0–1000 / 1–1000; hp capped at maxHp       |
| speed                | 0–400                                     |
| gravity components   | -300–300                                  |
| friction / timeScale | 0–10 / 0.1–2                              |
| arena dimensions     | 256–4096                                  |
| tags                 | 16 strings, 32 characters each            |
| color                | Six-digit hex, e.g. `#77ddff`             |
| toast                | 80 characters, control characters removed |
| tint duration        | 0–10,000 milliseconds                     |

NaN and infinities are rejected. Text length validation is not content moderation; chat intake and UI text moderation remain later PLAN.md work. The current overlay can run the base engine or the sandboxed demo. The verifier and Codex patch CLI are implemented; Twitch integration remains a later step.

## Visual mod API (Step 8.5)

Optional entity fields preserve compatibility with existing mods: `shape` is circle, triangle, square, hex, star or diamond; `glow` is clamped to 0..1. An omitted shape uses the entity-kind silhouette; omitted glow uses the renderer default. Collision geometry stays circular. Changes are journaled and restored when a patch is removed.

`g.fx.burst(x,y,color,count)` queues a cosmetic UI event (40 particles per call, 120 per simulation tick shared across all patches). It does not consume the engine RNG. The renderer drains events each frame. Shape, glow and bursts count toward the harness visible-effect check.

Mods may export a family-friendly `patchNotes` string. The sandbox strips control characters and caps it at 140 characters. The verified metadata travels through the hub and is displayed as plain text under the PATCH NOTES heading.

See [before/after screenshots and measured validation](docs/step-8.5-validation.md). To reproduce the load run, start `npm run dev`, open `http://localhost:5173/?bot=1&seed=1&perf=1&patchLifetime=600` and apply:

```sh
npm run patch:apply -- scripts/fixtures/visual-stress-field.js --author "render probe"
npm run patch:apply -- scripts/fixtures/visual-stress-color.js --author "render probe"
npm run patch:apply -- scripts/fixtures/visual-stress-sparks.js --author "render probe"
```

These are measurement fixtures, not normal rules: the field seeds 180 mixed entities and cancels player damage to keep the load test alive. Wait for caches and the 300-tick readout to warm up; keep the tab foregrounded. FPS depends on hardware and display refresh. Remove the fixtures or restart the hub afterward.

Licensed under the [MIT License](LICENSE).
