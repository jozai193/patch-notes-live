# Step 9 fixes: judge-friendly demo flow

Recorded November 8, 2026. Step 9 review fixes only. No repository creation, push, live Codex call or change to engine/mod/verifier invariants.

## Verification

- npx tsc -b: exit 0.
- Full root npm test: **181 passed** (engine 26, harness 28, mod-api 65, overlay 23, server 39).
- npm run lint: exit 0.
- npm run build:web: exit 0, including fresh **25/25 archive verification** in 44.97s.

The overlay regressions launch an isolated, headless system Chrome/Chromium through DevTools and the already-allowlisted ws package. ws is now explicitly declared as an overlay test dev dependency; npm reported no additional installed packages. Set BROWSER_PATH if Chrome/Chromium is outside a standard location. Browser profiles are temporary, and cleanup checks their resolved parent/prefix before removal. Headless focus emulation represents a foreground page for the focus regression.

## Production preview

Built the production site, then ran **npx vite preview**. Opened **http://localhost:4173/?server=ws://127.0.0.1:9** at 1280×720, with the persistent autopilot choice initially **off**.

- Onboarding stayed at **tick 0, HP 100/100** while visible. The arena still renders behind the card. Dismissal begins normal fixed-step ticking without accumulated catch-up.
- Typed **make enemies dance with jazz** using actual key events for **17,160ms**: player alive, **100/100 HP**, temporary autopilot active, chosen autopilot still off, and the **Autopilot while you type** chip visible.
- Enter produced **NO MATCH IN ARCHIVE**, with neither progress bar nor phase list. Suggestions were **Rainbow enemies**, **Orbiting enemies**, and **Enemies tiny and fast**.
- Clicked the first suggestion with a real pointer click: **Rainbow enemies** applied, credited to You. The ship shimmered with offline damage protection, then the protection expired. Blur returned effective autopilot to off, preserving the user's choice.
- The feedback panel occupied **x=1004, y=418, width=252, height=198**; the arena ended at **x=984**. It is a reserved sidebar row instead of an arena overlay. The archive list returns after feedback dismissal.
- Chrome logs expected **ERR_UNSAFE_PORT** connection attempts for the deliberately unavailable port 9; the offline game and archive flow remain functional.

[Raw preview observations](step-9-fixes-preview.json). Screenshots: [onboarding paused](screenshots/step-9-fixes-paused.png), [typing protection](screenshots/step-9-fixes-typing.png), [no match](screenshots/step-9-fixes-no-match.png), [applied patch shimmer](screenshots/step-9-fixes-shimmer.png).

## Regression coverage

1. **Focus → autopilot:** unit tests preserve both prior manual/on choices. A real DOM test focuses the rule input for 15 seconds, checks continued game ticks and survival, transfers focus to the name input, blurs to the canvas, and verifies manual control returns. Persistent autopilot remains on across focus/blur.
2. **Onboarding pause:** real DOM test holds the card visible, verifies the actual tick counter and HP stay fixed, then dismisses it and checks there is no catch-up burst. OBS mode does not leave an invisible onboarding card blocking the game.
3. **No match:** real DOM test checks the title, zero rendered rectangles for hidden phases/progress, three clickable chips, successful patch apply, and six-second auto-dismiss. Ranking tests keep weak requests out of automatic matching and return at most three distinct suggestion names.
4. **Panel/game-over layout:** real DOM bounding boxes prove the visible sidebar slot does not intersect the game-over card, Restart button, or revert banner. Showing the game-over card immediately suppresses panel rendering. The frame loop also explicitly hides feedback while game-over is active.
5. **Offline grace:** a real engine collision test behind the overlay host confirms damage cancellation for 180 ticks, damage resumes after expiry, and a connected game gets no grace. Shimmer state uses the same tick predicate. Protection is armed before onStart/the first tick and renewed on confirmed application.

The engine and verifier remain unchanged. This assistance is an overlay host plus intent/UI scheduling; render-only shimmer does not consume the engine RNG.

## Command outputs

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
   Start at  17:45:48
   Duration  1.47s (transform 268ms, setup 0ms, import 1.94s, tests 1.01s, environment 1ms)


> @patch-notes-live/harness@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/harness

VERIFY split-on-hit: PASS in 759.2ms, sandbox p95 0.105ms
VERIFY gravity-flip-every-10s: PASS in 935.7ms, sandbox p95 0.073ms
VERIFY floor-is-lava: PASS in 351.2ms, sandbox p95 0.000ms
VERIFY enemies-tiny-and-fast: PASS in 381.1ms, sandbox p95 0.056ms
VERIFY heal-on-kill: PASS in 365.9ms, sandbox p95 0.000ms
VERIFY infinite-loop: FAIL budget in 284.9ms
VERIFY throws-on-tick: FAIL stability in 515.6ms
VERIFY unbounded-spawner: FAIL runaway in 2922.8ms
VERIFY does-nothing: FAIL effect in 953.2ms
VERIFY instant-death: FAIL winnable in 53.6ms
GENERATED enemies-split-in-two-when-hit-2026-10-28T06-11-23-763Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.00px, mean enemy offset 0.00px, count difference 16, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 2: player max offset 0.60px, mean enemy offset 0.00px, count difference 15, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 3: player max offset 0.00px, mean enemy offset 0.00px, count difference 8, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0.
GENERATED gravity-pulls-everything-toward-the-center-2026-10-28T06-13-21-500Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.03px, mean enemy offset 366.61px, count difference 8, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 2: player max offset 0.23px, mean enemy offset 368.17px, count difference 9, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 3: player max offset 4.09px, mean enemy offset 286.57px, count difference 7, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0.

 Test Files  4 passed (4)
      Tests  28 passed (28)
   Start at  17:45:50
   Duration  25.71s (transform 207ms, setup 0ms, import 1.23s, tests 23.85s, environment 0ms)


> @patch-notes-live/mod-api@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/mod-api

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.309ms p95=0.612ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

 Test Files  8 passed (8)
      Tests  65 passed (65)
   Start at  17:46:17
   Duration  9.28s (transform 193ms, setup 0ms, import 887ms, tests 7.04s, environment 1ms)


> @patch-notes-live/overlay@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/overlay


 Test Files  6 passed (6)
      Tests  23 passed (23)
   Start at  17:46:26
   Duration  26.29s (transform 446ms, setup 0ms, import 2.19s, tests 26.70s, environment 1ms)


> @patch-notes-live/server@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/server


 Test Files  7 passed (7)
      Tests  39 passed (39)
   Start at  17:46:53
   Duration  15.52s (transform 373ms, setup 0ms, import 1.96s, tests 12.37s, environment 0ms)
Exit code: 0
```

### npm run lint

```text
> lint
> eslint .
Exit code: 0
```

### npm run build:web

```text
> build:web
> npm run verify:archive && vite build packages/overlay --config packages/overlay/vite.config.ts --outDir ../../dist --emptyOutDir


> verify:archive
> node scripts/archive.mjs

PASS sample-split-on-hit.js (797 ms)
PASS sample-gravity-flip-every-10s.js (1047 ms)
PASS sample-floor-is-lava.js (338 ms)
PASS sample-enemies-tiny-and-fast.js (353 ms)
PASS sample-heal-on-kill.js (306 ms)
PASS generated-enemies-split-in-two-when-hit.js (620 ms)
PASS generated-gravity-pulls-everything-toward-the-center.js (6806 ms)
PASS bench-2026-10-28-00-enemies-explode-into-3-tiny-ones-when-they-die.js (716 ms)
PASS bench-2026-10-28-01-make-the-player-huge.js (260 ms)
PASS bench-2026-10-28-02-every-5-seconds-everything-goes-slow-mo-for-1-second.js (940 ms)
PASS bench-2026-10-28-03-enemies-run-away-from-you-lol.js (3829 ms)
PASS bench-2026-10-28-04-bullets-bounce-off-the-walls.js (4977 ms)
PASS bench-2026-10-28-06-rainbow-enemies-that-keep-changing-color.js (3263 ms)
PASS bench-2026-10-28-07-lava-on-the-left-half-of-the-map.js (525 ms)
PASS bench-2026-10-28-08-slow-motion-when-my-hp-is-low.js (933 ms)
PASS bench-2026-10-28-09-heal-1-hp-every-second.js (930 ms)
PASS bench-2026-10-28-10-the-arena-keeps-shrinking.js (1199 ms)
PASS bench-2026-10-28-11-enemies-get-faster-every-time-you-kill-one.js (551 ms)
PASS bench-2026-10-28-12-health-pickups-chase-the-player.js (4394 ms)
PASS bench-2026-10-28-13-wrap-around-the-screen-edges-like-asteroids.js (250 ms)
PASS bench-2026-10-28-14-random-meteor-showers.js (2465 ms)
PASS bench-2026-10-28-15-killed-enemies-come-back-once-as-green-ghosts.js (580 ms)
PASS bench-2026-10-28-16-moon-gravity-pls.js (390 ms)
PASS bench-2026-10-28-17-boss-fight-a-giant-enemy-with-500-hp-every-30-seconds.js (1103 ms)
PASS bench-2026-10-28-18-enemies-orbit-around-the-player-instead-of-charging.js (7186 ms)
Archive: 25/25 passed in 44.97 s.
vite v8.3.5 building client environment for production...
transforming...
✓ 75 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                      7.13 kB │ gzip:   2.45 kB
dist/assets/emscripten-module-uFzwHH0Y.wasm        503.13 kB │ gzip: 235.94 kB
dist/assets/index-B8C6p-q4.css                      13.71 kB │ gzip:   3.81 kB
dist/assets/dist-DCJ-YC0h.js                         0.29 kB │ gzip:   0.22 kB
dist/assets/preload-helper-CRzLMJPS.js               1.53 kB │ gzip:   0.80 kB
dist/assets/ffi-4V2b7xu3.js                          6.32 kB │ gzip:   0.99 kB
dist/assets/emscripten-module.browser-YIdDcqRI.js    9.19 kB │ gzip:   4.17 kB
dist/assets/module-ES6BEMUI-CDTIpMiA.js             34.13 kB │ gzip:   8.84 kB
dist/assets/index-rc5pciR_.js                      102.92 kB │ gzip:  32.14 kB

✓ built in 128ms
Exit code: 0
```
