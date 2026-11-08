# Compile panel content fit

Verified November 8, 2026. The sidebar uses explicit grid areas, with feedback replacing
the Archive list in a content-sized row. The active-patch list yields spare height.
Neither feedback nor the request text has a scroll container.

The extended Chrome DOM regression reproduced a compiling overflow before the CSS fix:
`scrollHeight = 214`, `clientHeight = 196`, at both viewport sizes. After the fix,
all four layout cases pass. Tests check the panel's vertical/horizontal overflow,
request overflow, viewport containment, three no-match chips, visible compiling
phases/progress, separation from game-over/restart/apply/revert bounding boxes,
and hiding feedback during game over.

## Fresh command results

```text
> npx tsc -b
(no diagnostics; exit 0)

> npm test
engine:  Test Files 5 passed; Tests 26 passed
harness: Test Files 4 passed; Tests 28 passed
mod-api: Test Files 8 passed; Tests 65 passed
overlay: Test Files 6 passed; Tests 26 passed
server:  Test Files 7 passed; Tests 39 passed
Total: 184 passed; exit 0

> npm run lint
> eslint .
(no diagnostics; exit 0)

> npm run build:web
Archive: 25/25 passed in 40.84 s.
vite v8.3.5 building client environment for production...
75 modules transformed.
dist/index.html                                      7.13 kB
dist/assets/emscripten-module-uFzwHH0Y.wasm          503.13 kB
dist/assets/index-CcU_O1JY.css                       13.93 kB
dist/assets/dist-DCJ-YC0h.js                          0.29 kB
dist/assets/preload-helper-CRzLMJPS.js                1.53 kB
dist/assets/ffi-4V2b7xu3.js                           6.32 kB
dist/assets/emscripten-module.browser-YIdDcqRI.js     9.19 kB
dist/assets/module-ES6BEMUI-CDTIpMiA.js               34.13 kB
dist/assets/index-Dg3QPZ7s.js                       102.92 kB
built in 81ms; exit 0
```

## Production preview

Headed Chrome through Playwright, served by `npx vite preview` at localhost:4173.
No-match used the actual offline matching path and three suggestions. Clicking a
suggestion applied its patch at each size. Compiling used a mock WebSocket feed
with a 200-character rule, author `Judge`, elapsed timer, phases, progress, and
verification message; no Codex call was made.

The values below are DOM CSS pixels before the stage's viewport scaling:

| Viewport   | State             | scrollHeight | clientHeight | Request scroll / client | Arena overlap |
| ---------- | ----------------- | -----------: | -----------: | ----------------------: | ------------- |
| 1280 × 720 | No match, 3 chips |          186 |          186 |          0 / 0 (hidden) | No            |
| 1024 × 768 | No match, 3 chips |          186 |          186 |          0 / 0 (hidden) | No            |
| 1280 × 720 | Compiling         |          263 |          263 |               101 / 101 | No            |
| 1024 × 768 | Compiling         |          263 |          263 |               101 / 101 | No            |

All four panels also have `scrollWidth = clientWidth = 249`. Screenshots were
saved and visually inspected in `output/playwright/panel-{no-match,compile}-{width}x{height}.png`.
