# Step 8.5 validation

Recorded November 4, 2026. Visual overhaul only; the rule box and subsequent steps are not implemented. No new dependencies. Canonical api.d.ts copied into the template by the build. All game sprites and effects are procedural canvas geometry; screenshots are documentation, not runtime assets.

## Result

- Full root test: **166 passed** (engine 26, harness 28, mod-api 61, overlay 17, server 34).
- TypeScript build and lint: exit 0. Overlay production build: exit 0.
- Final 20-second load sample: **127.1–138.9 FPS**, **182–192 entities**, **3 patches throughout**. Worst rolling frame p95 **13.90 ms**; sandbox mean **0.359–0.379 ms/tick**, worst p95 **0.600 ms/tick**. All samples exceed the 60fps target.
- Earlier warmed 20-second sample: 144.0 FPS, 186–213 entities, three patches; frame p95 7.10ms, sandbox mean 0.268–0.293ms, p95 0.400ms.
- Raw samples and environment: [performance.json](step-8.5-performance.json). Headed Chromium 156 on Windows, 1280×720, approximately DPR 1; FPS is hardware/display dependent. These are rolling readouts sampled once per second, not independent non-overlapping timing windows.
- Node sandbox calibration in final full test: 50 enemies / three mods / 600 ticks, mean 0.230ms, p95 0.461ms; maximum 1/64 instruction polls.

## Reproduce the load

Run npm run dev, open http://localhost:5173/?bot=1&seed=1&perf=1&patchLifetime=600, then apply these through the real hub. Each source is independently verified before broadcast. The stress-field fixture seeds 180 mixed stationary enemies/pickups/hazards, then leaves normal waves, projectiles, collisions and rendering active; it cancels player damage solely to keep the probe alive. The other patches tint plating and periodically emit bursts. This is a renderer load fixture, not a gameplay balance claim.

```sh
npm run patch:apply -- scripts/fixtures/visual-stress-field.js --author "render probe"
npm run patch:apply -- scripts/fixtures/visual-stress-color.js --author "render probe"
npm run patch:apply -- scripts/fixtures/visual-stress-sparks.js --author "render probe"
```

All three controller results returned ok:true. Wait for warmup and the 300-tick window; keep the tab foregrounded. Apply cards, their 600ms rewrite, and restart were exercised through normal live protocol paths. No world or engine-RNG mutation was used to measure FPS.

## Browser observations

- 1280×720 layout, 960×600 canvas, 252px side panel. All three active rows fit without overflow.
- Cyan aimed ship/thruster, hex chasers, small triangles, projectile streaks, rotating green diamonds and molten orange pools. Mod colors still tint geometry, halos, trails and kill particles.
- Damage numbers, hit flashes, shake, wave banners and combo appear during play. Cosmetic state never modifies snapshots or consumes the engine RNG (regression tested).
- A warmed three-second browser probe wrapped the native canvas shadowBlur setter and observed **zero writes** on both the main canvas and offscreen contexts. Cache misses bake halos once; the atlas is bounded to 192 entries and 4M pixels (~16MB raw RGBA).
- Live split-on-hit displayed the sanitized patchNotes sentence after its rewrite. Fourth apply expired the oldest without reload. A direct revert showed red RGB/tearing, ROLLING BACK REALITY and the existing red banner while the game continued.
- Visual API probe set the player to a green glowing star and enemies to squares/diamonds, emitted a burst, and shrank/wrapped the arena to 640.4×420.4. Walls remained centered at base scale; rounded label read 640 × 420 / WRAP, with a dashed border and dark void. Revert restored the owned visual fields and arena.
- Browser console: zero errors. Restart retained active patches. OBS transparency/cursor rules remain enabled; background/vignette are omitted inside the arena in OBS mode, with dimmed void strips outside smaller walls.
- Initial probe used a stale long-running hub module and was refused for unknown API; restarting the rebuilt hub resolved this. The final runs used the supported API. The first unoptimized fixture read all entities every tick and was correctly watchdog-reverted as too slow; the committed fixture performs bounded setup and lightweight ongoing hooks. Safety limits were not changed.

## Screenshots

Before/after are captured from the real browser; scene timing and active patches differ. They show styling, not a controlled gameplay comparison.

- [Before](screenshots/step-8.5-before.png) — original renderer.
- [After](screenshots/step-8.5-after.png) — live good samples, ship/trails, hazards, combo and funny notes.
- [Load](screenshots/step-8.5-load.png) — final load run and actual performance readout.
- [Rewrite](screenshots/step-8.5-rewrite.png) — apply channel split / scanline tearing.
- [Revert](screenshots/step-8.5-revert.png) — red rewrite and banner.
- [Arena](screenshots/step-8.5-arena-wrap.png) — fixed smaller walls, rounded label, shape/glow API.

## Command output

### npx tsc -b

```text
(no diagnostics)
Exit code: 0
```

### npm test (full root run)

```text
> test
> npm run test --workspaces


> @patch-notes-live/engine@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/engine


 Test Files  5 passed (5)
      Tests  26 passed (26)
   Start at  12:19:44
   Duration  1.27s (transform 228ms, setup 0ms, import 1.61s, tests 877ms, environment 0ms)


> @patch-notes-live/harness@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/harness

VERIFY split-on-hit: PASS in 696.2ms, sandbox p95 0.093ms
VERIFY gravity-flip-every-10s: PASS in 883.7ms, sandbox p95 0.066ms
VERIFY floor-is-lava: PASS in 311.4ms, sandbox p95 0.000ms
VERIFY enemies-tiny-and-fast: PASS in 343.5ms, sandbox p95 0.057ms
VERIFY heal-on-kill: PASS in 327.5ms, sandbox p95 0.000ms
VERIFY infinite-loop: FAIL budget in 252.5ms
VERIFY throws-on-tick: FAIL stability in 464.4ms
VERIFY unbounded-spawner: FAIL runaway in 2674.7ms
VERIFY does-nothing: FAIL effect in 799.8ms
VERIFY instant-death: FAIL winnable in 35.1ms
GENERATED enemies-split-in-two-when-hit-2026-10-28T06-11-23-763Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.00px, mean enemy offset 0.00px, count difference 16, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 2: player max offset 0.60px, mean enemy offset 0.00px, count difference 15, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 3: player max offset 0.00px, mean enemy offset 0.00px, count difference 8, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0.
GENERATED gravity-pulls-everything-toward-the-center-2026-10-28T06-13-21-500Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.03px, mean enemy offset 366.61px, count difference 8, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 2: player max offset 0.23px, mean enemy offset 368.17px, count difference 9, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 3: player max offset 4.09px, mean enemy offset 286.57px, count difference 7, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0.

 Test Files  4 passed (4)
      Tests  28 passed (28)
   Start at  12:19:45
   Duration  22.48s (transform 179ms, setup 0ms, import 1.08s, tests 20.86s, environment 0ms)


> @patch-notes-live/mod-api@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/mod-api

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.230ms p95=0.461ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

 Test Files  7 passed (7)
      Tests  61 passed (61)
   Start at  12:20:08
   Duration  7.08s (transform 144ms, setup 0ms, import 657ms, tests 5.47s, environment 0ms)


> @patch-notes-live/overlay@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/overlay


 Test Files  4 passed (4)
      Tests  17 passed (17)
   Start at  12:20:16
   Duration  1.23s (transform 246ms, setup 0ms, import 1.39s, tests 493ms, environment 0ms)


> @patch-notes-live/server@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/server


 Test Files  5 passed (5)
      Tests  34 passed (34)
   Start at  12:20:17
   Duration  10.55s (transform 305ms, setup 0ms, import 1.53s, tests 8.30s, environment 0ms)
Exit code: 0
```

### npm run lint

```text
> lint
> eslint .
Exit code: 0
```

### npm run build and overlay build

```text
> build
> tsc -b && npm run build:template -w @patch-notes-live/server


> @patch-notes-live/server@0.0.0 build:template
> node build-template.mjs


> @patch-notes-live/overlay@0.0.0 build
> vite build

vite v8.3.5 building client environment for production...
transforming...
✓ 45 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                      4.72 kB │ gzip:   1.77 kB
dist/assets/emscripten-module-uFzwHH0Y.wasm        503.13 kB │ gzip: 235.94 kB
dist/assets/index-DBJ7S5r_.css                       8.97 kB │ gzip:   2.66 kB
dist/assets/dist-BXHpbmIx.js                         0.26 kB │ gzip:   0.21 kB
dist/assets/preload-helper-BLdHbfdN.js               1.51 kB │ gzip:   0.79 kB
dist/assets/ffi-4V2b7xu3.js                          6.32 kB │ gzip:   0.99 kB
dist/assets/emscripten-module.browser-BdAREQyj.js    9.17 kB │ gzip:   4.17 kB
dist/assets/module-ES6BEMUI-CDTIpMiA.js             34.13 kB │ gzip:   8.84 kB
dist/assets/index-C3crTBg2.js                       63.23 kB │ gzip:  21.52 kB

✓ built in 73ms
Exit codes: 0
```
