# Redesign polish validation

Fresh production-preview checks on November 10, 2026. This is a UI follow-up; no
later PLAN step was started. All commits remain local.

## Command output

```text
> npx tsc -b
(no diagnostics; exit 0)

> npm test
> npm run test --workspaces
engine:  Test Files 5 passed; Tests 26 passed
harness: Test Files 4 passed; Tests 28 passed
mod-api: Test Files 8 passed; Tests 67 passed
overlay: Test Files 7 passed; Tests 40 passed
server:  Test Files 7 passed; Tests 39 passed
Total: 200 passed; exit 0

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.273ms p95=0.573ms

> npm run lint
> eslint .
(exit 0)

> npm run build:web
> npm run verify:archive
Archive: 25/25 passed (70.00s)
Vite: 92 modules transformed; built in 118ms; exit 0
dist/index.html                         10.67 kB | gzip 3.21 kB
dist/assets/index-21UXy1jV.css           19.46 kB | gzip 5.16 kB
dist/assets/index-CZeyqc03.js           126.28 kB | gzip 40.79 kB
dist/assets/emscripten-module-*.wasm    503.13 kB | gzip 235.94 kB
```

The archive verifier was run in full by the web-build script, including independent
seven-check verification of every mod. There is one release-sync WASM variant.

## Changes and regressions

- The archive disclosure shares the composer's hint row. Real-browser layout tests
  cover both compiling and three-suggestion no-match states at 1280×720, 1024×768
  and 800×600. Content fits without scrolling; the panel stays clear of game-over
  and banners. Composer, disclosure and controls footer do not overlap.
- “Try one” wraps whole chips into at most two rows, with an explicit “More →”
  control. A test reaches all 25 entries. The generated split mod is now **Split
  and replace**: it removes the hit parent and substitutes two children. The
  original **Split on hit** leaves the parent alive and adds children. The archive
  source export and index agree, and verification rejects duplicate names.
- Unit tests cover `by you`, case/whitespace normalization and other authors.
  Both feed and patch card render the current user's label in `--you`.
- All 25 mod sources were read to assign `change` metadata: 10 additions and 15
  changes, no removals. Fleeing enemies, homing pickups and bouncing bullets alter
  existing behavior (`~`); split children, ghosts, bosses and healing add things
  (`+`). Reverts use `−`. Ticker/feed use the metadata, not title matching.
  Tests require valid classifications, distinct names and valid wire metadata.
  Archive collection preserves these reviewed values.
- The patch card is lower-left, below the Wave banner. A canvas text-bounds test
  checks simultaneous visibility. A fourth-apply test checks that the expiry
  banner takes priority over the new card. Archive success says **Applied** and
  dismisses after two seconds.
- Play runs an explicit 360ms wipe before starting the simulation; reduced motion
  gets a 240ms opacity-only crossfade. Browser tests check the animation, its
  elapsed lifetime and aligned centers of the shared em-sized diff gutters.

## Production browser measurements

Used the built overlay at `http://localhost:4175/`, headed Chromium, Windows,
device-pixel ratio approximately 1. Raw results are in
[redesign-polish-browser.json](redesign-polish-browser.json).

| Viewport | Composer-to-footer gap | No-match content/client height | Applied dismissal |
| -------- | ---------------------: | -----------------------------: | ----------------: |
| 1280×720 |                 3.20px |                      211 / 211 |          2001.9ms |
| 1024×768 |                 2.56px |                      211 / 211 |          2001.9ms |
| 800×600  |                 2.00px |                      211 / 211 |          2002.8ms |

Measured normal Play at **375ms**, reduced-motion Play at **298.6ms**, both below
450ms. Different-sized headline marks have matching centers within 0.001px.
The compile capture's full content/client height is **255 / 255**. Phone landing
width and scroll width are both 390px, while the playable world stays at tick 0.
The capture run reported no browser errors.

The controlled density check sampled 15 consecutive seconds after warm-up with
the real renderer, QuickJS and watchdog, a crowd fixture plus actual Heal on kill
and Gravity flip archive mods. Every sample had three active patches and a living
player: **176–183 entities, 144 fps, frame p95 7.10ms, sandbox mean 0.308–0.331ms,
sandbox p95 0.500ms**. Raw samples are in
[redesign-polish-perf.json](redesign-polish-perf.json). These are local fixture
measurements, not a guarantee for arbitrary combinations.

A separate dense Rainbow/Gravity/crowd check retained three patches during its
15-second observation: 181 entities, 144 fps, frame p95 7.20ms, sandbox mean
2.931ms / p95 3.500ms at the final readout. It did not trigger a watchdog revert
on this run. The older `watchdog-revert.png` and November 8 measurements remain
historical evidence; no new watchdog screenshot is claimed.

## Updated screenshots

- [Desktop landing](screenshots/redesign/landing-desktop.png),
  [390px phone](screenshots/redesign/landing-phone.png),
  [mid-diff headline](screenshots/redesign/headline-mid-diff.png)
- [Two active patches](screenshots/redesign/game-two-patches.png),
  [compile panel](screenshots/redesign/compile-panel.png),
  [revert](screenshots/redesign/revert.png)
- [800×600 no-match](screenshots/redesign/no-match-800x600.png),
  [1024×768 no-match](screenshots/redesign/no-match-1024x768.png),
  [1280×720 no-match](screenshots/redesign/no-match-1280x720.png)
- [800×600 card and Wave](screenshots/redesign/patch-card-and-wave-800x600.png),
  [1024×768 card and Wave](screenshots/redesign/patch-card-and-wave-1024x768.png),
  [1280×720 card and Wave](screenshots/redesign/patch-card-and-wave-1280x720.png)
- [Wipe](screenshots/redesign/transition-wipe.png),
  [reduced-motion crossfade](screenshots/redesign/transition-crossfade.png),
  [density check](screenshots/redesign/performance.png)

The two-patch, no-match and timing captures use actual offline archive actions.
Compile and manual-revert screenshots use controlled WebSocket protocol messages;
no live Codex generation was requested. Density checks mock delivery but run real
mod source in QuickJS. These fixtures do not establish server generation latency.
