# Patch Notes Live

Steps 1–5 implement the shared deterministic game core, playable overlay, QuickJS sandbox, headless verifier and sample mods. The server remains a workspace stub. See [PLAN.md](PLAN.md) for the later build steps.

## Play locally

Use Node 24 and npm:

```sh
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). The root command starts the overlay; `npm run dev -w @patch-notes-live/overlay` does the same thing. Vite imports engine TypeScript source through an alias, so no engine build is needed before starting the game.

Move with **WASD**, aim with the **mouse**, and hold **left click** to fire. Press **B** or click Autopilot to toggle the scripted bot. After game over, press **R** or click Restart Run to restart with the same seed. Focus the game window to use the keyboard. Controls reset when the window loses focus; hidden tabs pause simulation time instead of accumulating a catch-up backlog.

- `?seed=42` selects a deterministic seed (default 1).
- `?bot=1` starts with autopilot on.
- `?obs=1` makes the page and arena background transparent and hides the cursor.
- `?mod=split-on-hit` loads the sandboxed demo mod; enemies split into two smaller enemies when shot. Try [the demo with autopilot](http://localhost:5173/?bot=1&mod=split-on-hit&seed=1).
- `?perf=1` shows fps, frame interval p95, and sandbox time per tick (mean/p95), with rolling windows of 300 frames and 300 simulation ticks. Timings are diagnostic and never control normal mod execution.
- Combine them: [OBS + bot, seed 1](http://localhost:5173/?obs=1&bot=1&seed=1).

The layout uses a 1280×720 logical stage scaled to fit the window. Rendering interpolates between fixed 60 Hz simulation snapshots. Particles, hit flashes, screen shake, toast fading and tint timing are cosmetic; they do not consume the engine RNG. The HUD shows HP, wave, score, survival time and v1.0. The Active patches panel identifies the demo when loaded. Restart creates fresh per-mod VM state, and particle hooks compose alongside the sandbox host.

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

The output is `packages/overlay/dist/`. Runtime Twitch integration and patch loading are later PLAN.md steps.

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

The root test script runs every workspace. The server stub explicitly allows no tests; engine, harness, mod-api and overlay tests are required. TypeScript builds use strict mode, ESM and project references. Only the overlay includes DOM libraries, and the harness has Node typings. Engine compilation has only the ES2022 library, with no DOM or ambient Node types. Overlay type-check output goes to `dist-types/`, separate from the Vite production bundle. No credentials are needed for Steps 1–5.

## Verify a mod

Run `npm run verify -- <file> [--json]`. Exit codes are 0 for pass, 1 for a failed mod and 2 for a harness/usage error. JSON goes to stdout and the readable summary to stderr; use `npm run --silent verify -- <file> --json` when parsing npm's output.

The verifier checks load/size, three-seed stability, instruction budget, runaway entity accumulation, bot survival, observable effect against an identical-input baseline, and independent seed-1 replay determinism. Every run uses a fresh sandbox. See [harness usage and report semantics](packages/harness/README.md) and [the sample module catalog](mods/samples/README.md).

From a future patch workspace outside the repository, run the CLI by absolute path; relative mod paths resolve in that workspace:

```powershell
node 'E:/Twitchcon hackathon/packages/harness/verify.mjs' ./mod.js --json
```

## Engine

```ts
import { World, botIntent } from '@patch-notes-live/engine';

const world = new World(1);
for (let i = 0; i < 1200; i++) world.tick(botIntent(world.snapshot()));
const frame = world.snapshot();
```

One `tick(intent)` advances 1/60 second. Movement components are normalized to length at most one; aim is an absolute arena point. Player and enemy controlled velocity steers toward desired movement with `min(1, 10 * dt)`. Gravity velocity accumulates separately so steering cannot cancel it, capped at 150 px/s per axis so the player can fight sustained gravity. Friction damps both components. At zero friction, gravity of 300 moves an idle player 113.75 pixels in 60 ticks. Boundary stops and explicit velocity commands reset the corresponding gravity component. Time, wave scheduling, weapon cooldowns and projectile expiry use the integer tick clock. `timeScale` scales movement integration, not this clock. Dead worlds stop advancing. Snapshots are detached serializable rendering/mod inputs, not save-state restoration records.

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

NaN and infinities are rejected. Text length validation is not content moderation; chat intake and UI text moderation remain later PLAN.md work. The current overlay can run the base engine or the sandboxed demo. The verifier is implemented; Twitch and the Codex patch pipeline remain later steps.
