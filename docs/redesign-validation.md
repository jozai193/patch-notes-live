# Patch-notes redesign validation

Fresh checks and browser captures on November 8, 2026.

The design system was committed first as `75148f6` (`design: patch-notes design system`),
before UI code. It defines the semantic palette, measured contrast, color-vision
screening, self-hosted type, copy, layout and motion rules in [design.md](design.md).

## Command output

```text
> npx tsc -b
(no diagnostics; exit 0)

> npm test
> npm run test --workspaces
engine:  Test Files 5 passed; Tests 26 passed
harness: Test Files 4 passed; Tests 28 passed
mod-api: Test Files 8 passed; Tests 66 passed
overlay: Test Files 7 passed; Tests 34 passed
server:  Test Files 7 passed; Tests 39 passed
Total: 193 passed; exit 0

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.225ms p95=0.425ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

> npm run lint
> eslint .
(no diagnostics; exit 0)

> npm run build:web
Archive: 25/25 passed in 37.96 s.
vite v8.3.5 building client environment for production...
89 modules transformed.
dist/index.html                               10.50 kB (gzip 3.19 kB)
dist/assets/index-rO2nzz3p.css                  18.88 kB (gzip 5.03 kB)
dist/assets/index-DlJZRxda.js                  123.61 kB (gzip 39.98 kB)
dist/assets/emscripten-module-uFzwHH0Y.wasm    503.13 kB (gzip 235.94 kB)
dist/licenses/fonts.txt                       14.25 kB (gzip 2.27 kB)
built in 104ms; exit 0
```

The static distribution is 24 files / 973,603 bytes uncompressed, including 251,732
bytes of self-hosted Latin font files (WOFF/WOFF2 fallbacks). There is one release-sync
QuickJS WASM variant. The relative Vite base remains `./`.

## Browser verification

Headed Chrome on Windows, production `npx vite preview` at localhost:4173. No new
Codex calls were made. [Raw UI measurements](redesign-browser.json) and
[performance samples](redesign-perf.json) accompany this record.

- At 390px, document width is 390px: no horizontal page overflow. The playable
  canvas remains at tick zero while the separate attract world advances.
- The actual archive UI applies Enemies run away and Rainbow enemies without a
  reload. Their feed rules and countdowns use identical slot colors; attribution
  reads “by You (you) · archive”.
- The compile panel has `scrollHeight = clientHeight = 255` CSS pixels. The compile
  screenshot uses a mock protocol feed, explicitly not a real generation result.
  The expiration screenshot likewise uses a controlled protocol revert.
- Automated real-Chrome coverage also checks Enter/Play, OBS and play=1 bypass,
  transparent OBS canvas pixels, reduced motion, intentional mod colors, typing
  autopilot, paused onboarding, no-match suggestions, and feedback fit/separation
  from game-over/restart/apply/revert bounds at 1280×720 and 1024×768.
- Color tests require AA contrast on the surface, forbid literal UI/render colors
  outside tokens.css, and screen all six patch slots under normal and three CVD
  simulations. A host regression checks read-only spawn provenance and cleanup.

## Renderer performance and its limits

The stress scene uses the real engine, QuickJS runtimes, renderer and watchdog:
a controlled density mod spawns in batches of eight until it has visited 190
positions, excluding 120px around the initial player; the other two mods are the
actual Heal on kill and Gravity flip archive sources. Delivery is mocked, with no
changes to the engine, budgets, watchdog thresholds or verifier. The density source
is a performance fixture, not a newly verified archive entry.

After 5.5 seconds of warm-up, 15 one-second observations all retained three patches
and a living player:

| Measurement                | Recorded range / maximum |
| -------------------------- | ------------------------ |
| Entities in logged samples | 176–182                  |
| Render FPS                 | 135.0–141.2              |
| Frame time p95             | at most 13.8ms           |
| Sandbox time p95           | at most 0.5ms            |
| Sandbox rolling mean       | 0.267–0.279ms            |

The final performance screenshot is slightly later than the sample window and shows
186 entities / three patches. These are local measurements, not a hardware-independent
guarantee for every mod combination.

A separate density run with Rainbow enemies exceeded the existing per-mod slowness
watchdog and was reverted with “Patch reverted: too slow”; the feed identifies Rainbow
as reverted. This is recorded separately and is not counted as a passing three-patch
performance run. An initial fixture that attempted more than 32 spawns in a call was
also correctly rejected; the accepted density setup batches its spawns.

## Screenshots

- [Desktop landing](screenshots/redesign/landing-desktop.png)
- [390px landing](screenshots/redesign/landing-phone.png)
- [Headline during the diff](screenshots/redesign/headline-mid-diff.png)
- [Game with two active archive patches](screenshots/redesign/game-two-patches.png)
- [Compile panel, mock feed](screenshots/redesign/compile-panel.png)
- [Revert banner, controlled expiration](screenshots/redesign/revert.png)
- [150+ entity performance scene](screenshots/redesign/performance.png)
- [Actual watchdog revert in the dense Rainbow scene](screenshots/redesign/watchdog-revert.png)

All were saved and visually inspected. No repository was created or pushed.
