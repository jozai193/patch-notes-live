# Patch Notes Live

Step 1 implements the shared deterministic game core. The other four packages are intentionally empty workspace stubs. See [PLAN.md](PLAN.md) for the later build steps.

## Local checks

Use Node 24 and npm:

```sh
npm install
npx tsc -b
npm test
npm run lint
npm run format
```

The root test script runs every workspace. Empty stubs explicitly allow no tests; the engine requires tests. TypeScript builds use strict mode, ESM and project references. Engine compilation has only the ES2022 library, with no DOM or ambient Node types. No credentials are needed for Step 1.

## Engine

```ts
import { World, botIntent } from '@patch-notes-live/engine';

const world = new World(1);
for (let i = 0; i < 1200; i++) world.tick(botIntent(world.snapshot()));
const frame = world.snapshot();
```

One `tick(intent)` advances 1/60 second. Movement components are normalized to length at most one; aim is an absolute arena point. Player and enemy controlled velocity steers toward desired movement with `min(1, 10 * dt)`. Gravity velocity accumulates separately so steering cannot cancel it, capped at 150 px/s per axis so the player can fight sustained gravity. Friction damps both components. At zero friction, gravity of 300 moves an idle player 113.75 pixels in 60 ticks. Boundary stops and explicit velocity commands reset the corresponding gravity component. Time, wave scheduling, weapon cooldowns and projectile expiry use the integer tick clock. `timeScale` scales movement integration, not this clock. Dead worlds stop advancing. Snapshots are detached serializable rendering/mod inputs, not save-state restoration records.

Waves arrive every 600 ticks, starting at tick 1, with increasing counts and speed. Enemies chase the player. Projectiles deal damage and expire after 120 ticks. Enemy deaths award points and can drop healing pickups. Hazards and enemies deal contact damage at most once per 30 ticks per attacker. Movement wraps when enabled; collisions use circle overlap at current arena coordinates. The uniform grid inserts all cells touched by each circle and deduplicates candidate pairs.

## Future sandbox adapter boundary

`ModHost` has the hook signatures from PLAN.md; the default host does nothing. It is an engine integration interface for the future sandbox adapter, **not a loader for untrusted JavaScript**. No mod source is executed in this step, and `packages/mod-api/api.d.ts` is not created yet.

Initialization calls `onStart` before spawn notifications. Each live tick calls `onTick`, creates a scheduled wave and projectiles, integrates movement, resolves collisions (`onHit` before damage and `onKill` after death), then drains remaining spawn notifications. `onSpawn` receives detached entities. Hook-generated spawn chains are bounded at 1,000 notifications per drain.

Game entity reads are detached and shared by entity ID within each hook invocation. After the hook returns, changes to known mutable fields are diffed into validated `setEntity` commands. This includes `g.player`, `enemies()`/`entities()` results, hook event arguments and `spawn()` return values. Unknown properties are ignored; ID and kind remain immutable. `g.set(entity, fields)` applies validated changes to the tracked copy, so subsequent reads and assignments in the same hook see them. Spawn commands run before mutation diffs; removed entities are not recreated by a diff. Invalid field batches are rejected. Copies retained beyond a hook invocation cannot change the world. Game spawn/remove/UI methods queue validated commands. Physics and arena changes are collected after each hook. `Game.state` is host-owned scratch data. Step 3 will marshal sandbox mutations into `Command[]` using the same boundary.

`applyCommands` accepts untrusted parsed data and returns an acceptance flag per command. Invalid commands are rejected atomically. At most 1,000 commands per batch and 300 entities are accepted; the player cannot be removed. IDs and kinds cannot be changed. UI events retain the newest 32 entries across ticks. Snapshots read them without consuming them; the future renderer calls `world.drainEvents()` to consume the buffer once. Events submitted between ticks remain available until drained or displaced by the cap.

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

NaN and infinities are rejected. Text length validation is not content moderation; chat intake and UI text moderation remain later PLAN.md work. There is no renderer, network integration, sandbox or patch pipeline in Step 1.
