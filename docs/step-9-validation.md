# Step 9 validation

Recorded November 4, 2026. Scope: rule box, patch archive and static web build only. No repository was created and nothing was pushed. No dependencies were added.

## Results

- npx tsc -b: exit 0.
- Full root npm test: **174 passed** (engine 26, harness 28, mod-api 64, overlay 17, server 39). npm test uses fake Codex runners only.
- npm run lint: exit 0.
- npm run verify:archive: **25/25 passed**, 68.86 seconds on this run. The web build also independently ran the same archive gate (25/25, 55.99s). Several simulation-heavy entries take more than five seconds on this machine; no verifier or watchdog limits were relaxed.
- npm run build:web: exit 0; **673,762 bytes raw / 286,061 bytes gzip** summed across all nine built files using Node gzipSync defaults, including **one 503,134-byte release-sync WASM file**. Main entry JS is 99.76kB raw / 31.29kB gzip. [Exact size inventory](step-9-build-size.json).

## Real live request

With npm run dev running, used the actual browser rule input and Enter to submit **enemies run away from you**, leaving the name empty. The hub used the real Codex SDK pipeline, streamed bounded compile events, and independently verified the returned source before broadcast.

- Request ID: 7e00754e-a03f-497c-b227-b998f5bbd6c0.
- Final status: **ok**, archived=false, duration to final passed event **70,758ms**.
- Patch: **Fear the player**, author **You**, origin **live**, ID bcd2fe31-b8e3-4d02-998b-b6ecb536086c.
- The compile panel showed the submitted rule, phase list, changing timer and progress bar. No model reasoning or raw commands were displayed. Apply was a hot-swap with no navigation/reload.
- **Material limitation:** after application, the increasingly crowded world pushed this generated mod over the existing live timing threshold. The watchdog reverted it with reason **too slow**. A later capture shows 273 entities, zero active patches and an ended run. This is evidence that generation/verification/apply and the watchdog work; it is not a claim that this generated rule stayed healthy for its entire lifetime. Limits were unchanged.
- [Real streamed events and observation](step-9-live-run.json). [Compile screenshot](screenshots/step-9-compiling.png). [Later ended run](screenshots/step-9-watchdog-ended.png).

The mapper now labels actual file-writing commands as editing, test commands as testing, and leaves read-only commands in thinking. Pipeline passed events remain in testing until the hub finishes its independent verification. Tests cover these semantics without a second real Codex call.

## No-hub production browser

Stopped the root dev launcher, including its hub. A direct WebSocket probe could not connect to localhost:8787. Started the requested **npx vite preview** from the repository root, serving the completed dist at http://localhost:4173. The production build defaults to archive mode and makes no automatic hub connection.

- Typed **make the player huge** and pressed Enter: **Huge player** applied, credited to You, with the visibly enlarged ship. Notes were explicitly prefixed **FROM THE ARCHIVE**. Countdown started from the new **180s** default (178s in screenshot).
- Visible disclosure: Web demo: patches come from an archive of AI-written mods. Run locally for live Codex patching.
- Compile UI for this path was titled ARCHIVE PATCH and showed cached → loading → sandbox → applied, with Loaded a patch from the archive — no live AI generation. It does not pretend to invoke Codex.
- An unmatched keyboard/submarine request showed the exact no-archive message. Clicking Split on hit in the archive immediately applied it afterward. Offline archive attempts are not artificially held to the live AI cooldown.
- First-run help dismissed normally, remained dismissed on reload, and actual keyboard typing of **wasdbr** stayed in the input: bot mode remained on and the game clock did not reset.
- [Standalone screenshot](screenshots/step-9-web-demo.png).

Copied the built files into a temporary nested static directory and served them with a second Vite preview at **http://localhost:4174/judges/demo/**. With the hub still stopped, Huge player applied and fetched its WASM from **/judges/demo/assets/emscripten-module-uFzwHH0Y.wasm**. This checks relative JS/CSS/WASM resolution at two nested path levels.

Overrode localStorage access to throw SecurityError before reload: help still appeared, dismissal worked, the rule box still applied Huge player, and the browser reported zero console errors/warnings. [Subfolder observation](step-9-subfolder.json) · [screenshot](screenshots/step-9-subfolder.png). The extra preview/browser used for this probe was stopped afterward.

## Archive and safety coverage

All available candidates passed: **5 good samples + 2 existing generated mods + 18 benchmark sources = 25**. Each source was freshly verified before copying, enriched with bounded funny patchNotes when absent, then verified again. [Index](../mods/archive/index.json) contains file/name/request/patchNotes/tags; [provenance](../mods/archive/provenance.json) records original paths. Later live generation was not saved into mods/generated and is separate from this initial archive.

Tests cover strict protocol envelopes, length/controls, blocklist, normalized/synonym matching and weak-match refusal; one compile worker plus three waiting jobs; per-client 20s cooldown; attributed live apply; quota fallback and no-match behavior; rejected/failed/timeout results; and refusal of a fake generator’s invalid source through the real independent verifier. Existing lifecycle, deterministic sandbox, hostile-mod, harness and engine gates still pass.

The default-startup integration tests caught an archive-loading/listening race; archive files are now loaded before the WebSocket listener is created. The new real-verifier integration test polls for completion with a 10-second transport wait, rather than its original 1-second default; this changes only test synchronization, not any runtime or harness safety threshold.

The Pages workflow was written using [GitHub’s custom-workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). It is prepared, not remotely executed; the owner must create/push the repository and enable Pages via GitHub Actions. The README’s online link is intentionally a placeholder.

## Command outputs

### npx tsc -b

```text
(no diagnostics)
Exit code: 0
```

### npm test — complete root output

```text
> test
> npm run test --workspaces


> @patch-notes-live/engine@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/engine


 Test Files  5 passed (5)
      Tests  26 passed (26)
   Start at  14:17:41
   Duration  1.54s (transform 253ms, setup 0ms, import 1.90s, tests 1.05s, environment 1ms)


> @patch-notes-live/harness@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/harness

VERIFY split-on-hit: PASS in 918.7ms, sandbox p95 0.136ms
VERIFY gravity-flip-every-10s: PASS in 1038.3ms, sandbox p95 0.086ms
VERIFY floor-is-lava: PASS in 368.8ms, sandbox p95 0.000ms
VERIFY enemies-tiny-and-fast: PASS in 410.4ms, sandbox p95 0.066ms
VERIFY heal-on-kill: PASS in 393.5ms, sandbox p95 0.000ms
VERIFY infinite-loop: FAIL budget in 301.4ms
VERIFY throws-on-tick: FAIL stability in 530.4ms
VERIFY unbounded-spawner: FAIL runaway in 3081.0ms
VERIFY does-nothing: FAIL effect in 1025.9ms
VERIFY instant-death: FAIL winnable in 49.9ms
GENERATED enemies-split-in-two-when-hit-2026-10-28T06-11-23-763Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.00px, mean enemy offset 0.00px, count difference 16, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 2: player max offset 0.60px, mean enemy offset 0.00px, count difference 15, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 3: player max offset 0.00px, mean enemy offset 0.00px, count difference 8, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0.
GENERATED gravity-pulls-everything-toward-the-center-2026-10-28T06-13-21-500Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.03px, mean enemy offset 366.61px, count difference 8, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 2: player max offset 0.23px, mean enemy offset 368.17px, count difference 9, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0; Seed 3: player max offset 4.09px, mean enemy offset 286.57px, count difference 7, radius difference 0.00px, color false, shape false, glow false, physics false, arena false, UI events 0.

 Test Files  4 passed (4)
      Tests  28 passed (28)
   Start at  14:17:43
   Duration  26.84s (transform 220ms, setup 0ms, import 1.33s, tests 24.83s, environment 0ms)


> @patch-notes-live/mod-api@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/mod-api

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.304ms p95=0.621ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

 Test Files  8 passed (8)
      Tests  64 passed (64)
   Start at  14:18:10
   Duration  8.82s (transform 193ms, setup 0ms, import 931ms, tests 6.54s, environment 1ms)


> @patch-notes-live/overlay@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/overlay


 Test Files  4 passed (4)
      Tests  17 passed (17)
   Start at  14:18:19
   Duration  1.43s (transform 338ms, setup 0ms, import 1.38s, tests 624ms, environment 1ms)


> @patch-notes-live/server@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/server


 Test Files  7 passed (7)
      Tests  39 passed (39)
   Start at  14:18:21
   Duration  14.25s (transform 323ms, setup 0ms, import 1.83s, tests 11.25s, environment 0ms)
Exit code: 0
```

### npm run lint

```text
> lint
> eslint .
Exit code: 0
```

### npm run verify:archive

```text
> verify:archive
> node scripts/archive.mjs

PASS sample-split-on-hit.js (1050 ms)
PASS sample-gravity-flip-every-10s.js (1432 ms)
PASS sample-floor-is-lava.js (555 ms)
PASS sample-enemies-tiny-and-fast.js (622 ms)
PASS sample-heal-on-kill.js (542 ms)
PASS generated-enemies-split-in-two-when-hit.js (1074 ms)
PASS generated-gravity-pulls-everything-toward-the-center.js (12946 ms)
PASS bench-2026-10-28-00-enemies-explode-into-3-tiny-ones-when-they-die.js (1278 ms)
PASS bench-2026-10-28-01-make-the-player-huge.js (423 ms)
PASS bench-2026-10-28-02-every-5-seconds-everything-goes-slow-mo-for-1-second.js (1932 ms)
PASS bench-2026-10-28-03-enemies-run-away-from-you-lol.js (7310 ms)
PASS bench-2026-10-28-04-bullets-bounce-off-the-walls.js (9067 ms)
PASS bench-2026-10-28-06-rainbow-enemies-that-keep-changing-color.js (6618 ms)
PASS bench-2026-10-28-07-lava-on-the-left-half-of-the-map.js (903 ms)
PASS bench-2026-10-28-08-slow-motion-when-my-hp-is-low.js (1936 ms)
PASS bench-2026-10-28-09-heal-1-hp-every-second.js (1506 ms)
PASS bench-2026-10-28-10-the-arena-keeps-shrinking.js (1693 ms)
PASS bench-2026-10-28-11-enemies-get-faster-every-time-you-kill-one.js (783 ms)
PASS bench-2026-10-28-12-health-pickups-chase-the-player.js (5131 ms)
PASS bench-2026-10-28-13-wrap-around-the-screen-edges-like-asteroids.js (244 ms)
PASS bench-2026-10-28-14-random-meteor-showers.js (2523 ms)
PASS bench-2026-10-28-15-killed-enemies-come-back-once-as-green-ghosts.js (551 ms)
PASS bench-2026-10-28-16-moon-gravity-pls.js (279 ms)
PASS bench-2026-10-28-17-boss-fight-a-giant-enemy-with-500-hp-every-30-seconds.js (902 ms)
PASS bench-2026-10-28-18-enemies-orbit-around-the-player-instead-of-charging.js (7282 ms)
Archive: 25/25 passed in 68.86 s.
Exit code: 0
```

### npm run build:web

```text
> build:web
> npm run verify:archive && vite build packages/overlay --config packages/overlay/vite.config.ts --outDir ../../dist --emptyOutDir


> verify:archive
> node scripts/archive.mjs

PASS sample-split-on-hit.js (647 ms)
PASS sample-gravity-flip-every-10s.js (843 ms)
PASS sample-floor-is-lava.js (247 ms)
PASS sample-enemies-tiny-and-fast.js (298 ms)
PASS sample-heal-on-kill.js (256 ms)
PASS generated-enemies-split-in-two-when-hit.js (597 ms)
PASS generated-gravity-pulls-everything-toward-the-center.js (8790 ms)
PASS bench-2026-10-28-00-enemies-explode-into-3-tiny-ones-when-they-die.js (901 ms)
PASS bench-2026-10-28-01-make-the-player-huge.js (332 ms)
PASS bench-2026-10-28-02-every-5-seconds-everything-goes-slow-mo-for-1-second.js (1376 ms)
PASS bench-2026-10-28-03-enemies-run-away-from-you-lol.js (5010 ms)
PASS bench-2026-10-28-04-bullets-bounce-off-the-walls.js (6577 ms)
PASS bench-2026-10-28-06-rainbow-enemies-that-keep-changing-color.js (4298 ms)
PASS bench-2026-10-28-07-lava-on-the-left-half-of-the-map.js (625 ms)
PASS bench-2026-10-28-08-slow-motion-when-my-hp-is-low.js (1295 ms)
PASS bench-2026-10-28-09-heal-1-hp-every-second.js (1474 ms)
PASS bench-2026-10-28-10-the-arena-keeps-shrinking.js (1587 ms)
PASS bench-2026-10-28-11-enemies-get-faster-every-time-you-kill-one.js (728 ms)
PASS bench-2026-10-28-12-health-pickups-chase-the-player.js (5315 ms)
PASS bench-2026-10-28-13-wrap-around-the-screen-edges-like-asteroids.js (322 ms)
PASS bench-2026-10-28-14-random-meteor-showers.js (3284 ms)
PASS bench-2026-10-28-15-killed-enemies-come-back-once-as-green-ghosts.js (718 ms)
PASS bench-2026-10-28-16-moon-gravity-pls.js (368 ms)
PASS bench-2026-10-28-17-boss-fight-a-giant-enemy-with-500-hp-every-30-seconds.js (1198 ms)
PASS bench-2026-10-28-18-enemies-orbit-around-the-player-instead-of-charging.js (8674 ms)
Archive: 25/25 passed in 55.99 s.
vite v8.3.5 building client environment for production...
transforming...
✓ 74 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                      6.83 kB │ gzip:   2.39 kB
dist/assets/emscripten-module-uFzwHH0Y.wasm        503.13 kB │ gzip: 235.94 kB
dist/assets/index-Crtk8Cdc.css                      12.54 kB │ gzip:   3.57 kB
dist/assets/dist-DCJ-YC0h.js                         0.29 kB │ gzip:   0.22 kB
dist/assets/preload-helper-CRzLMJPS.js               1.53 kB │ gzip:   0.80 kB
dist/assets/ffi-4V2b7xu3.js                          6.32 kB │ gzip:   0.99 kB
dist/assets/emscripten-module.browser-YIdDcqRI.js    9.19 kB │ gzip:   4.17 kB
dist/assets/module-ES6BEMUI-CDTIpMiA.js             34.13 kB │ gzip:   8.84 kB
dist/assets/index-3Q1awpjG.js                       99.76 kB │ gzip:  31.29 kB

✓ built in 76ms
Exit code: 0
```
