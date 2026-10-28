# Step 8 live hot-swap validation

Executed 2026-10-28 on Windows / Node 24. Step 9 was not started. The normal npm run dev process remains running with Vite at http://localhost:5173 and the local hub at ws://localhost:8787.

## Required checks

npx tsc -b: exit 0, no diagnostics.

### npm run lint

```text
> lint
> eslint .
```

Exit 0.

### npm run build -w @patch-notes-live/overlay

```text
> @patch-notes-live/overlay@0.0.0 build
> vite build

vite v8.3.5 building client environment for production...
transforming...
✓ 43 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                      4.72 kB │ gzip:   1.77 kB
dist/assets/emscripten-module-uFzwHH0Y.wasm        503.13 kB │ gzip: 235.94 kB
dist/assets/index-BgBcIAxi.css                       7.31 kB │ gzip:   2.25 kB
dist/assets/dist-BXHpbmIx.js                         0.26 kB │ gzip:   0.21 kB
dist/assets/preload-helper-BLdHbfdN.js               1.51 kB │ gzip:   0.79 kB
dist/assets/ffi-4V2b7xu3.js                          6.32 kB │ gzip:   0.99 kB
dist/assets/emscripten-module.browser-BdAREQyj.js    9.17 kB │ gzip:   4.17 kB
dist/assets/module-ES6BEMUI-CDTIpMiA.js             34.13 kB │ gzip:   8.84 kB
dist/assets/index-0JjtSNA4.js                       53.43 kB │ gzip:  18.45 kB

✓ built in 73ms
```

Exit 0.

### npm test

```text
> test
> npm run test --workspaces


> @patch-notes-live/engine@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/engine


 Test Files  4 passed (4)
      Tests  24 passed (24)
   Start at  18:57:51
   Duration  1.08s (transform 237ms, setup 0ms, import 383ms, tests 910ms, environment 0ms)


> @patch-notes-live/harness@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/harness

VERIFY split-on-hit: PASS in 797.7ms, sandbox p95 0.116ms
VERIFY gravity-flip-every-10s: PASS in 863.1ms, sandbox p95 0.070ms
VERIFY floor-is-lava: PASS in 338.9ms, sandbox p95 0.000ms
VERIFY enemies-tiny-and-fast: PASS in 385.7ms, sandbox p95 0.062ms
VERIFY heal-on-kill: PASS in 437.9ms, sandbox p95 0.000ms
VERIFY infinite-loop: FAIL budget in 450.1ms
VERIFY throws-on-tick: FAIL stability in 740.8ms
VERIFY unbounded-spawner: FAIL runaway in 4475.0ms
VERIFY does-nothing: FAIL effect in 1448.0ms
VERIFY instant-death: FAIL winnable in 73.8ms
GENERATED enemies-split-in-two-when-hit-2026-10-28T06-11-23-763Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.00px, mean enemy offset 0.00px, count difference 16, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 2: player max offset 0.60px, mean enemy offset 0.00px, count difference 15, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 3: player max offset 0.00px, mean enemy offset 0.00px, count difference 8, radius difference 0.00px, color false, physics false, arena false, UI events 0.
GENERATED gravity-pulls-everything-toward-the-center-2026-10-28T06-13-21-500Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.03px, mean enemy offset 366.61px, count difference 8, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 2: player max offset 0.23px, mean enemy offset 368.17px, count difference 9, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 3: player max offset 4.09px, mean enemy offset 286.57px, count difference 7, radius difference 0.00px, color false, physics false, arena false, UI events 0.

 Test Files  3 passed (3)
      Tests  25 passed (25)
   Start at  18:57:52
   Duration  27.37s (transform 219ms, setup 0ms, import 655ms, tests 26.26s, environment 0ms)


> @patch-notes-live/mod-api@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/mod-api

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.244ms p95=0.465ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

 Test Files  6 passed (6)
      Tests  55 passed (55)
   Start at  18:58:20
   Duration  6.77s (transform 147ms, setup 0ms, import 306ms, tests 5.62s, environment 0ms)


> @patch-notes-live/overlay@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/overlay


 Test Files  3 passed (3)
      Tests  15 passed (15)
   Start at  18:58:27
   Duration  816ms (transform 237ms, setup 0ms, import 322ms, tests 495ms, environment 0ms)


> @patch-notes-live/server@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/server


 Test Files  5 passed (5)
      Tests  34 passed (34)
   Start at  18:58:29
   Duration  9.83s (transform 274ms, setup 0ms, import 809ms, tests 8.26s, environment 0ms)
```

Exit 0.

All 153 tests passed: engine 24, harness 25, sandbox/protocol 55, overlay 15, server 34. Codex calls remain mocked in npm test. The approved @types/ws dependency replaces the temporary local declaration.

## Live browser observations

- Initial live split-on-hit application kept the same page and advanced game time 00:14 to 00:17 while changing v1.0 to v1.1. The panel showed the patch author and countdown, and the apply card appeared.
- Four sequential applications left exactly three active patches at v1.4. The oldest split patch was reverted with reason expired. The final compact sidebar keeps all three countdowns and the bot control visible (DOM checks panelFits=true and botFits=true).
- Pressing R kept the same page, v1.4 and all three patches while game time reset from 02:24 to 00:01. Remaining lifetimes continued rather than resetting.
- The time bomb passed server verification. A watcher armed before its deadline captured game time 01:10, active count 0 / 3, and the red banner PATCH REVERTED: Time bomb: game time exceeded 70 seconds. Its first run also reverted correctly in hub logs; an initially late screenshot watcher missed the eight-second banner, so the capture was repeated from a fresh run.
- A valid temporary arena probe rendered a centered 640x400 wrapping arena at fixed base scale, with dim void outside and a dashed border.
- instant-death.js was refused with winnable failure and CLI exit 1.
- A separate browser stayed playable with no hub on port 8788 (game time 00:01, Standalone reconnecting). Starting a temporary hub on that port changed it to Hub connected at game time 00:26 without navigation. That extra browser and hub were then closed; only ports 5173 and 8787 remain listening.

Development source edits triggered normal Vite HMR/page reloads between scenarios. Runtime CLI apply/revert operations themselves did not navigate or reload the page.

Screenshots are local ignored artifacts under output/playwright/: step8-live-split.png, step8-panel-final.png, step8-fourth-final.png, step8-time-bomb.png and step8-arena-wrap.png.

## Live command outputs

### npm run patch:apply -- mods/samples/split-on-hit.js

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/split-on-hit.js

{
  "v": 1,
  "type": "result",
  "requestId": "603a7c9a-f095-4326-8ed5-442c88cc4800",
  "ok": true,
  "patchId": "01846638-0551-420c-81f7-21c1f05ac8c1"
}
```

### npm run patch:apply -- mods/samples/split-on-hit.js --author first

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/split-on-hit.js --author first

{
  "v": 1,
  "type": "result",
  "requestId": "e62d2c52-257c-4b4a-a0f9-88252c8147f2",
  "ok": true,
  "patchId": "38766026-c26f-4ee8-bac3-d62afbd57239"
}
```

### npm run patch:apply -- mods/samples/enemies-tiny-and-fast.js --author second

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/enemies-tiny-and-fast.js --author second

{
  "v": 1,
  "type": "result",
  "requestId": "c30283db-ded8-4af7-9039-212d4af5c3fb",
  "ok": true,
  "patchId": "e5e98683-d90b-43ab-ad57-14949889e03c"
}
```

### npm run patch:apply -- mods/samples/heal-on-kill.js --author third

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/heal-on-kill.js --author third

{
  "v": 1,
  "type": "result",
  "requestId": "42cc0e0e-912d-48fa-a936-c83901460767",
  "ok": true,
  "patchId": "05d5ddcb-a644-4d8f-99a8-df336487deed"
}
```

### npm run patch:apply -- mods/samples/gravity-flip-every-10s.js --author fourth

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/gravity-flip-every-10s.js --author fourth

{
  "v": 1,
  "type": "result",
  "requestId": "06cb8a5c-21b3-4691-9470-dbcbce198f21",
  "ok": true,
  "patchId": "f4e233b3-9565-4bb6-86bc-5dc4a062eda1"
}
```

### npm run patch:revert -- 49497ca2-7e44-4e20-a97d-e0b85df5e4d0

```text
> patch:revert
> node scripts/server.mjs revert ***

{
  "v": 1,
  "type": "result",
  "requestId": "cd154e05-ea46-4bfb-98f0-d8d44a569b2f",
  "ok": true,
  "patchId": "49497ca2-7e44-4e20-a97d-e0b85df5e4d0"
}
```

### npm run patch:apply -- mods/samples/time-bomb.js

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/time-bomb.js

{
  "v": 1,
  "type": "result",
  "requestId": "28867173-ec25-4a86-8e95-31af392cdf93",
  "ok": true,
  "patchId": "ed796222-5055-430a-a1a7-68ea6e598a98"
}
```

### npm run patch:apply -- output/playwright/arena-probe.js

```text
> patch:apply
> node scripts/server.mjs apply output/playwright/arena-probe.js

{
  "v": 1,
  "type": "result",
  "requestId": "7a07b889-5dff-4280-911b-e698518ea0b1",
  "ok": true,
  "patchId": "369e361b-5812-40f9-a719-d4cd8afeeaa1"
}
```

### npm run patch:apply -- mods/samples/instant-death.js (expected refusal)

```text
> patch:apply
> node scripts/server.mjs apply mods/samples/instant-death.js

{
  "v": 1,
  "type": "result",
  "requestId": "da0ad736-5ed4-4f34-9c1e-2e2426b88fc4",
  "ok": false,
  "reason": "winnable: Seed 1 ended after 0.00 s, below the 5 s minimum. Fix: avoid setting player HP to zero, spawning lethal hazards on the player, or multiplying damage beyond survivable levels."
}
```

## Captured watchdog result

```json
{
  "time": "01:10",
  "count": "0 / 3",
  "banner": "PATCH REVERTED: Time bomb: game time exceeded 70 seconds"
}
```

Rule rollback restores owned static rule fields and spawns at the next tick. It deliberately does not rewind gameplay movement, damage, score or time. The 60-second verifier cannot prove behavior after its horizon; this is why live runtime budgets and the watchdog remain necessary.
