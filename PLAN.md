# Patch Notes Live: Implementation Plan

> Players write the game's rules. Codex turns them into real, sandboxed code while the game is live.

**Current targets (updated November 4)**

- Next Byte Hacks V5: **November 7, 5 PM EST** (user-provided deadline). Judging: innovation, technical complexity, execution/polish, and presentation, 25% each.
- Arbiter Hacks V1, General track: **December 20**.
- Twitch is optional. The primary input is an in-game rule box; Step 9 adds the verified archive and standalone web demo. Earlier Twitch-specific submission steps below are historical, pending a separate plan revision.

---

## 1. Architecture

```
 Rule box / optional chat ─WS─▶ ┌──────────────── server (Node/TS) ───────────────┐
                              │ intake → moderation → clustering → vote          │
                              │                 │                                │
                              │                 ▼                                │
                              │  patch pipeline: Codex SDK thread in             │
                              │  OS temp workspace (template + API + tests)    │
                              │                 │                                │
                              │                 ▼                                │
                              │  independent re-verify (headless harness)        │
                              │                 │                                │
                              │  mod cache (fallback)    ◀── embeddings          │
                              └───────┬─────────────────────────────▲───────────┘
                                      │ WebSocket (state, events)    │ telemetry
                                      ▼                              │ (errors, tick time)
                    ┌──────── overlay + game (browser, OBS source) ─┴───────┐
                    │ engine (shared TS) + QuickJS sandbox running mods       │
                    │ watchdog → auto-revert   UI: vote, compile feed, notes  │
                    └─────────────────────────────────────────────────────────┘
```

**Repo layout (npm workspaces)**

```
packages/
  engine/      pure TS game core: deterministic tick, entities, seeded RNG. Runs in browser AND Node
  mod-api/     api.d.ts (the contract Codex codes against) + sandbox host (quickjs-emscripten)
  harness/     headless simulator + invariant checks; CLI: `harness verify <mod.js>`
  overlay/     Vite app: canvas renderer, OBS browser source, UI panels
  server/      Twitch EventSub, intake, moderation, clustering, voting, patch pipeline, WS hub
mod-template/  the workspace copied for every Codex patch (AGENTS.md, api.d.ts, mod.js stub, test script)
mods/archive/  verified samples, generated/benchmark mods and request metadata (fallback)
scripts/       token helper, latency benchmark, demo seeding
```

**Key decisions**

| Decision               | Choice                                                                                       | Why                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Game                   | Top-down arena survival (player vs waves)                                                    | Many easy-to-mutate rules (enemies, physics, spawns, scoring), and readable at a glance |
| Determinism            | Fixed 60 Hz tick, seeded RNG, engine with no DOM                                             | Same code runs in the overlay and in the headless harness, so tests mean something      |
| Sandbox                | `quickjs-emscripten-core` + release-sync WASM, fixed interrupt-count budget and memory limit | Isolated WASM per mod; normal budget decisions are deterministic                        |
| Mod contract           | Small typed hook API (below)                                                                 | Small enough for Codex to get right reliably, rich enough for surprising rules          |
| Codex runtime          | `@openai/codex-sdk` (`startThread` + `runStreamed`); `codex exec --json` as fallback         | Codex is part of the product; streamed events feed the on-stream "compile feed"         |
| Trust                  | The server **re-runs the harness itself** after Codex finishes                               | Never trust the model's "tests pass" claim                                              |
| Chat (later, optional) | EventSub WebSocket `channel.chat.message` + Helix `POST /chat/messages`                      | No public HTTPS endpoint needed; it's the officially recommended chat path              |
| Fallback               | Verified archive matched by normalized tokens and synonyms                                   | The demo survives slow or failed API calls                                              |

**Mod API v1 (keep it this small at first)**

```ts
// mods export: { name, description, patchNotes?: string, hooks }; notes capped at 140
interface Hooks {
  onStart?(g: Game): void;
  onTick?(g: Game, dt: number): void;
  onHit?(
    g: Game,
    e: { attacker: Entity; target: Entity; damage: number },
  ): void | { damage?: number; cancel?: boolean };
  onSpawn?(g: Game, e: Entity): void;
  onKill?(g: Game, e: { killer?: Entity; victim: Entity }): void;
}
interface Game {
  time: number;
  rand(): number;
  player: Entity;
  enemies(): Entity[];
  entities(): Entity[];
  spawn(kind: 'enemy' | 'pickup' | 'hazard', opts: SpawnOpts): Entity;
  remove(e: Entity): void;
  set(entity: Entity, fields: Partial<Omit<Entity, 'id' | 'kind'>>): void;
  physics: { gravity: Vec; friction: number; timeScale: number };
  arena: { width: number; height: number; wrap: boolean };
  ui: { toast(text: string): void; tint(color: string, ms: number): void };
  fx: { burst(x: number, y: number, color: string, count: number): void };
  state: Record<string, unknown>; // per-mod scratch storage
}
interface Entity {
  id: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  color: string;
  tags: string[];
  shape?: 'circle' | 'triangle' | 'square' | 'hex' | 'star' | 'diamond';
  glow?: number;
}
```

**Limits:** at most 3 active mods (the oldest expires), at most 300 entities, and a deterministic budget of 64 QuickJS interrupt-handler polls per mod per tick, shared across hooks. The performance target remains low millisecond overhead; wall-clock timing is telemetry, not normal control flow. A single VM call reaching 50 ms triggers emergency permanent disable. Three consecutive faulted calls or ten total also disable a mod. Uninitializable mods are disabled immediately.

**Harness invariants (a mod must pass all of them)**

1. 3,600 headless ticks (60 s) with 3 seeds and no exceptions.
2. 95th-percentile tick time stays under budget, and the entity count stays at or under the cap.
3. The game stays winnable: the player can survive 20 s with a scripted bot on at least 1 seed, and the run doesn't end in under 5 s.
4. **The effect is visible:** compare 900 ticks plus initialization with a no-mod baseline using identical seed/intents on seeds 1–3. At least one seed must show player max offset >=40px, mean matched-enemy offset >=20px, entity count difference >=3, any entity color change, radius difference >=2px, shape/glow changes, physics/arena changes, or at least one toast/tint/burst. Report all measurements and recommend making effects visible within 10 seconds.
5. Static checks: no `while(true)`; file size under 8 KB; exports match the schema.

---

## 2. Step-by-step build

Each step lists **what to build** and **done when**, followed by a **Codex prompt**. Run them in order in one Codex thread.

### Step 0: Accounts and keys (about 1 h, do this now)

- Twitch: create an app at dev.twitch.tv/console. Create a second Twitch account for the bot. Your own channel is the test channel.
- Get a user token for the bot with `user:read:chat user:write:chat user:bot`, and from the broadcaster `channel:bot` (or make the bot a mod). Easiest route: the Twitch CLI `twitch token -u -s "..."`.
- OpenAI API key (embeddings and moderation). Sign Codex in (`codex login`).
- Copy `.env.example` to `.env`: `TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, BOT_USER_ID, BROADCASTER_USER_ID, BOT_TOKEN, OPENAI_API_KEY`.
- **Done when:** `.env` is filled in and `codex exec "echo hi"` works headless.

### Step 1: Workspace scaffold and engine core (Day 1)

- Set up npm workspaces, TS project references, `vitest`, eslint.
- `engine`: `World` with a fixed-step `tick()`, entities, a circle-collision broadphase (grid), player AI hook, enemy waves, scoring, seeded RNG (mulberry32), and a `snapshot()` for rendering.
- **Done when:** `npm test` runs an engine test: 3,600 ticks are deterministic for a given seed (identical snapshot hash).
- Codex prompt: _"Create an npm-workspaces TypeScript monorepo per PLAN.md section 1. Implement packages/engine: a deterministic 60 Hz top-down arena survival core (player, enemy waves that chase the player, projectiles, collisions via a uniform grid, hp/damage/score, mulberry32 RNG). No DOM. Add vitest tests proving determinism by snapshot hash."_

### Step 2: Renderer and playable overlay (Day 1)

- `overlay`: Vite app with a canvas renderer for snapshots, keyboard controls, and an HUD. Transparent background option for OBS (`?obs=1`).
- **Done when:** you can play it at `localhost:5173` and add it as an OBS browser source.
- Codex prompt: _"Implement packages/overlay: Vite + canvas renderer for engine snapshots, WASD + mouse aim, HUD (hp, wave, score, active mods list). Render at 60 fps from a fixed-step loop with interpolation. ?obs=1 gives transparent background."_

### Step 3: Mod API and QuickJS sandbox (Day 1, **the riskiest piece**)

- `mod-api`: `api.d.ts` per section 1, plus `SandboxHost` with a separate release-sync WASM module, runtime and context per mod. It exposes a **proxied** Game object (calls marshalled across the boundary), enforces the deterministic per-tick interrupt budget and memory limit, and returns hook results. Freeze shared intrinsics and report errors as bounded primitive messages; never dump mod-controlled VM objects.
- Batch the marshalling: pass entity arrays as plain data once per tick and apply mutations as a command list. Don't make thousands of individual boundary calls.
- **Done when:**
  - The 5 hand-written mods (Step 5) run.
  - An infinite-loop mod is interrupted without freezing the page.
  - 50 enemies plus 3 mods hold 60 fps.
- Codex prompt: _"Implement packages/mod-api: api.d.ts exactly per PLAN.md, and SandboxHost using quickjs-emscripten-core plus release-sync only. Each mod gets its own WASM instance/context, a shared 64-poll instruction budget per tick, a 50 ms emergency disable backstop, and a 16 MB memory limit. Marshal small hook payloads and lazily read entity lists. Collect mutations as validated commands applied by the engine. Harden error transport and dispose every handle. Add hostile-mod, disposal, deterministic replay and performance tests; disable after 3 consecutive or 10 total faulted calls."_

### Step 4: Headless harness (Day 1)

- `harness verify <mod.js> --json`: runs the invariants from section 1 and prints a JSON report (pass/fail per check, tick p95, entity max, error messages).
- **Done when:** the good sample mods pass and deliberately broken mods fail with clear reasons.

### Step 5: Hand-written sample mods (Day 1)

Write these yourself or with Codex: `split-on-hit`, `gravity-flip-every-10s`, `floor-is-lava` (hazard tiles), `enemies-are-tiny-and-fast`, `heal-on-kill`. Plus three deliberately bad ones: an infinite loop, one that throws, one that spawns without limit.

- **Done when:** the harness passes the 5 good mods and rejects the 3 bad ones. These also become seed examples in `mod-template/AGENTS.md`.

### Step 6: Codex patch pipeline as a CLI (Day 2)

- `mod-template/`: `AGENTS.md` (rules: edit only `mod.js`, use only `api.d.ts`, run `npm test` until it passes, keep it under 8 KB, don't touch the tests), `api.d.ts`, the `mod.js` stub, and `package.json` with `test` calling the harness.
- `server/src/patch/createPatch.ts`: `createPatch(request, { onEvent, signal, timeoutMs })`:
  1. Copy the template to `os.tmpdir()/patch-notes-live/<id>/`, outside the repository. Copy api.d.ts from the canonical mod-api contract at build time; use an absolute-path, prebuilt harness CLI command. Put at most 200 characters of untrusted viewer text only in REQUEST.md's quoted block.
  2. Use the installed SDK's `startThread()` / `runStreamed()` API with `skipGitRepoCheck: true`, `sandboxMode: 'workspace-write'`, no network, no approvals, and configurable model with low/medium reasoning. Emit short thinking/editing/testing/passed/failed/rejected events without raw reasoning. Non-rules or impossible requests produce result.json with a short rejection reason.
  3. **Independently** re-run the harness.
  4. Return `{status, source?, report?, reason?, durationMs, attempts, threadId}` with status ok/failed/rejected/timeout/quota. Usage-limit errors return quota without retry. Delete unexpected files before verification, while protected-file changes still fail. Always attempt workspace cleanup; log cleanup errors without replacing the patch result.
  5. Hard timeout of 150 s, with one retry in the same thread that passes the failure report back to Codex. Tests inject a fake runner; npm test never calls real Codex.
- `npm run patch -- "enemies split in two when hit"` prints streamed events and results and saves verified source/report pairs under mods/generated/. Authenticate with Codex CLI login or CODEX_API_KEY.
- **Done when:** type-checking, full npm test and lint pass; real CLI requests for splitting enemies and center gravity succeed, and a request to ignore instructions and print the system prompt is rejected. Show full outputs, durations and statuses.

### Step 7: GO/NO-GO benchmark (end of Day 2, decides the project)

- `scripts/bench.mjs`, launched with `npm run bench -- [--only 0-5] [--concurrency 2]`: runs the exact 20 cases in `packages/server/src/bench/cases.ts`, with expected rejection for cases 5 and 19. Defaults to concurrency 2; supports ascending index ranges and comma-separated selections.
- Save generated sources, independent reports, full compile-feed output and summary.json under gitignored `bench-results/<timestamp>/`. Record status, expected-status match, duration, attempts, first failed check and per-seed visible-effect measurements. Failed verification results retain their source for diagnosis.
- Stop immediately on quota: abort active siblings, schedule no more cases, persist the partial summary and exit 75. Exclude quota/cancelled cases from completed quality and latency statistics and explicitly mark the benchmark incomplete.
- Print game-rule pass rate, correct/false rejections, false acceptances, median/p90 duration and retries used. Start with cases 0–5; continue with 6–19 only if at least four of the first six match and no quota occurred. Keep Step 8 out of scope.
- **Go:** pass rate of at least 70% and p90 of 150 s or less.
- **Adjust:** narrow the API, add more examples to `AGENTS.md`, use a smaller and faster model setting, or pre-generate during the vote.
- **No-go** (pass rate under 50%): switch to the fallback idea (Border War) with 4 days left.

### Step 8: Server, live hot-swap, watchdog (Day 2–3)

- `server`: local `ws` hub on PORT (8787 by default), with a version-1 validated JSON protocol. Send hello/applyPatch/revertPatch to overlays; accept overlay hello, patchApplied, patchReverted and one-second telemetry. Controller requests support apply/revert CLIs. Independently verify every source before broadcasting.
- `SandboxHost.addMod(id, source)` and `removeMod(id)` hot-swap isolated runtimes without a world reset. New onStart runs at the next tick; removal disposes the VM. Preserve deterministic budgets and fault auto-disable.
- Overlay PatchManager: at most three patches, oldest expires on the fourth; default lifetime 180 seconds, configurable. Keep patches on restart, rerun onStart, and show name/author/countdown. Revert on sandbox auto-disable using the first fault message, or p95 sandbox time >4ms over a three-second window. Restore owned rule settings/spawns without rewinding movement, damage, score or time.
- Version stack: v1.0 is the base game, and each applied patch adds +0.1 to the version.
- Render shrinking arenas at fixed base 960x640 scale with a centered dim void; scale down only for larger arenas. Round labels and draw a dashed wrap border. Generate dramatic, survivable effects, with hazards outside an 80px exclusion around spawn.
- `npm run dev` starts hub and overlay via a Node launcher. Support patch:apply, patch:revert, and patch generation with --apply. Standalone overlay operation and reconnect backoff remain supported. Show apply cards and red revert banners.
- Add time-bomb.js: passes the fixed 60-second harness, throws after game time 70s, and is reverted by the live watchdog.
- **Done when:** tsc, full npm test and lint pass; live split-on-hit applies without reload; fourth apply expires oldest; time bomb auto-reverts around 70s with its banner. Do not start Step 9.

### Step 8.5: Visual overhaul

- Procedural neon arena art only: cached offscreen glow sprites, ship/hex/triangle/diamond/pool silhouettes, trails, floating damage, kill combo, wave banners, and 600ms patch rewrite glitches. No image assets. Respect entity colors.
- Add optional Entity shape (circle/triangle/square/hex/star/diamond) and glow (0..1); add g.fx.burst(x,y,color,count), capped at 40 per call and 120 per tick. These are renderer UI events and count as visible harness effects, as do shape/glow changes.
- Optional mod patchNotes is stripped of control characters and capped at 140 characters. Carry it through sandbox metadata/protocol to the patch card. Keep old mods compatible.
- Fixed base-arena scale, centered smaller walls, dim void, larger arenas scale down, rounded size labels and dashed wrap walls. Narrow HUD at 1280x720.
- MIT license using the git author name; update template examples and good sample notes.
- **Done when:** tsc, full npm test, lint pass; real browser ?perf=1 shows at least 60fps with 150+ entities and three active patches; before/after screenshots saved in docs/screenshots. Commit step 8.5 only; no rule box or later step.

### Step 9: Rule box, patch archive, web build

- Primary input: 200-character rule box and optional name (default You) under the arena; Enter/Patch it sends a validated request to the local hub. Twitch remains optional.
- Hub: family-friendly blocklist, per-client 20s cooldown, one compile worker plus three waiting rules. Stream bounded compile events with request IDs and elapsed times, independently reverify before apply, preserve author attribution. Failures explain why; quota falls back to a matching archive patch with an honest label.
- Verified archive: five good samples, generated mods, and every available benchmark source that passes the harness; funny patchNotes and an index of file/name/request/notes/tags. verify:archive checks every entry. Share conservative normalized token/synonym matching across Node and browser; unmatched requests receive the explicit no-archive message. A clickable archive list works instantly.
- Rule/compile UI, first-run three-line help remembered with storage errors caught, web-demo disclosure, separate revert/combo anchors; default patch lifetime 180s.
- build:web bundles the archive with relative Vite base and release-sync WASM. Static pages work from subfolders without the hub. Add a main-branch Pages build/deploy workflow; do not create a remote or push.
- Judge README: pitch/screenshot, online placeholder, local setup/auth, architecture, safety, measured benchmark, Codex usage and limitations.
- **Done when:** tsc, full root test, lint, verify:archive pass; one real live rule request for enemies fleeing shows streamed progress and applies; build:web plus bare npx vite preview with hub stopped plays standalone and matches make the player huge; report archive count and build size. Commit step 9 only.

### Step 10: Clustering and voting (Day 3)

- Every 60 s round: embed the queued suggestions (`text-embedding-3-small`) and cluster them greedily (cosine ≥ 0.82). Score each cluster by unique users. The top 3 go to a vote.
- 30 s vote using `!1 !2 !3`, one vote per user (changing your vote is allowed). The winner goes to the patch pipeline.
- **Pipelining:** the next round's suggestion and vote phase runs while the current patch compiles, so there's never dead air.
- **Done when:** SimChat with 30 fake users produces sensible clusters and a winner.

### Step 11: Real Twitch integration (Day 3)

- EventSub WebSocket client: connect, handle `session_welcome` and create the `channel.chat.message` subscription via Helix within 10 s. Handle keepalive and timeout, `session_reconnect`, and revocation.
- Replies from the bot through `POST /helix/chat/messages`, e.g. "Patch v1.4 'Mitosis' by @viewer is LIVE".
- **Done when:** typing `!rule` in your real Twitch chat shows up on the overlay in under 1 s.

### Step 12: The on-stream show (Day 3, design is 25% of the score)

Overlay panels:

- Suggestion ticker.
- Vote bars.
- **Compile feed:** Codex's streamed steps shown as a terminal-style panel, with a progress bar.
- "PATCH NOTES vX.Y" card with the suggesting viewer's name.
- A red "PATCH REVERTED — reason" banner.
- Active-mod chips with countdowns until each expires.

Add sound cues, and keep text readable at 720p.

### Step 13: Mod cache fallback (Day 3)

- Each verified mod is saved with the embedding of its request. When a new winner is within cosine ≥ 0.9 of a cached mod, or when Codex times out or fails twice, serve the cached mod and label it honestly ("patch from archive").
- Fill the cache with 30+ mods from the benchmark runs.

### Step 14: **Next Byte freeze and submit (Oct 31, before 21:00 UTC)**

- Tag `v0.9-nextbyte`. Record a 2:30 video (problem → live demo → architecture → safety). Write the README with setup instructions. Add 3 screenshots. Submit.

### Step 15: Playtest and hardening (Nov 1)

- A live stream with 3–5 friends in chat. Fix everything that breaks.
- Handle edge cases: no suggestions in a round (pick from the cache or a "streamer's choice"), a tied vote, an EventSub reconnect, the OpenAI API being down, a mod that slowly leaks entities.
- A safety pass: the sandbox can't reach `fetch` or globals, and mods can't change the overlay's DOM or text beyond `ui.toast` (which is also length-limited and moderated).

### Step 16: TwitchCon submission (Nov 2, finish by about 12:00 PT, 2 h of buffer)

- **Video (under 3 min):**
  - 0:00 hook: "every chat game gives viewers a menu. we gave them the source code"
  - 0:10 real Twitch chat suggestions, then the vote
  - 0:35 compile feed (sped up)
  - 0:55 the game changes and chat reacts
  - 1:15 sabotage attempt ("infinite loop"), then a revert
  - 1:35 architecture and safety pipeline
  - 2:10 how it was built with Codex (Codex thread footage)
  - 2:40 end card
- README (setup, `.env`, OBS setup, SimChat mode so judges can test without Twitch), description, **Codex session ID**, and a public YouTube link.

---

## 3. Day-by-day schedule

| Day | Date   | Steps       | Exit criterion                                                                       |
| --- | ------ | ----------- | ------------------------------------------------------------------------------------ |
| 1   | Oct 28 | 0–5         | Playable game; sandboxed sample mods; harness accepts good mods and rejects bad ones |
| 2   | Oct 29 | 6–8         | `npm run patch "<rule>"` works; **go/no-go benchmark**                               |
| 3   | Oct 30 | 9–13        | Full loop from real Twitch chat to a live patch                                      |
| 4   | Oct 31 | 14 + polish | **Next Byte submitted**                                                              |
| 5   | Nov 1  | 15          | Live playtest, hardening                                                             |
| 6   | Nov 2  | 16          | **TwitchCon submitted**                                                              |

**Cut list (drop in this order if behind):** sound cues → channel-point priority → active-mod countdowns → clustering (fall back to "most-upvoted exact suggestion") → the retry loop.

## 4. Risks and mitigations

| Risk                                | Mitigation                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Codex is too slow (more than 2 min) | Overlap compiling with the next vote; the compile feed is part of the show; the cache                |
| Codex mods fail often               | Small API, strong examples in `AGENTS.md`, one retry with the failure report, a go/no-go on Day 2    |
| Sandbox too slow                    | Batched marshalling (one JSON in, one command list out per tick); cap entities; lower hook frequency |
| Abusive suggestions on stream       | Moderation endpoint, blocklist, and rule-intent filter; `ui.toast` text moderated and length-capped  |
| Twitch auth or EventSub problems    | Build SimChat first; Twitch is just one more `ChatSource` plug-in                                    |
| No real audience for the demo       | Recruit 3–5 friends; SimChat can top up the volume during rehearsal                                  |
| OpenAI outage during judging        | Judges can watch the video alone; README offers SimChat with cache-only mode                         |
