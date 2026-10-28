# Step 7 script validation

Executed 2026-10-28 before committing the benchmark script. The eight benchmark tests inject fake createPatch implementations and never invoke real Codex. They cover the exact catalog, selection validation, concurrency limits, source/report persistence, first-failure diagnostics, summary statistics, serial quota stop and concurrent sibling cancellation.

npx tsc -b: exit 0, no diagnostics.

npm run lint: exit 0, no diagnostics.

## Full root npm test

```text
> test
> npm run test --workspaces


> @patch-notes-live/engine@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/engine


 Test Files  4 passed (4)
      Tests  24 passed (24)
   Start at  13:08:30
   Duration  922ms (transform 196ms, setup 0ms, import 292ms, tests 785ms, environment 0ms)


> @patch-notes-live/harness@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/harness

VERIFY split-on-hit: PASS in 649.9ms, sandbox p95 0.089ms
VERIFY gravity-flip-every-10s: PASS in 843.2ms, sandbox p95 0.068ms
VERIFY floor-is-lava: PASS in 320.6ms, sandbox p95 0.000ms
VERIFY enemies-tiny-and-fast: PASS in 329.0ms, sandbox p95 0.055ms
VERIFY heal-on-kill: PASS in 277.7ms, sandbox p95 0.000ms
VERIFY infinite-loop: FAIL budget in 263.8ms
VERIFY throws-on-tick: FAIL stability in 464.7ms
VERIFY unbounded-spawner: FAIL runaway in 3577.5ms
VERIFY does-nothing: FAIL effect in 1116.7ms
VERIFY instant-death: FAIL winnable in 59.3ms
GENERATED enemies-split-in-two-when-hit-2026-10-28T06-11-23-763Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.00px, mean enemy offset 0.00px, count difference 16, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 2: player max offset 0.60px, mean enemy offset 0.00px, count difference 15, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 3: player max offset 0.00px, mean enemy offset 0.00px, count difference 8, radius difference 0.00px, color false, physics false, arena false, UI events 0.
GENERATED gravity-pulls-everything-toward-the-center-2026-10-28T06-13-21-500Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.03px, mean enemy offset 366.61px, count difference 8, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 2: player max offset 0.23px, mean enemy offset 368.17px, count difference 9, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 3: player max offset 4.09px, mean enemy offset 286.57px, count difference 7, radius difference 0.00px, color false, physics false, arena false, UI events 0.

 Test Files  3 passed (3)
      Tests  24 passed (24)
   Start at  13:08:31
   Duration  22.57s (transform 161ms, setup 0ms, import 529ms, tests 21.66s, environment 0ms)


> @patch-notes-live/mod-api@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/mod-api

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.209ms p95=0.398ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

 Test Files  4 passed (4)
      Tests  50 passed (50)
   Start at  13:08:54
   Duration  5.89s (transform 110ms, setup 0ms, import 210ms, tests 5.18s, environment 0ms)


> @patch-notes-live/overlay@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/overlay


 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  13:09:00
   Duration  213ms (transform 80ms, setup 0ms, import 110ms, tests 7ms, environment 0ms)


> @patch-notes-live/server@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/server


 Test Files  3 passed (3)
      Tests  30 passed (30)
   Start at  13:09:01
   Duration  6.15s (transform 203ms, setup 0ms, import 417ms, tests 5.36s, environment 0ms)
```

Exit 0: 137 tests passed. Actual benchmark runs follow this commit; their sources, full output and summary.json are saved under the gitignored bench-results directory.
