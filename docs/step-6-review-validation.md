# Step 6 review validation

Executed 2026-10-28. Before fixes, a one-shot enemy +300 vx command added 24.9996px over 60 ticks. The generated center-gravity mod on seed 1 over 600 ticks had player max offset 0px and mean matched-enemy offset 1.38975px.

After fixes, the one-shot push adds 83.033px in one second. External drift uses damping 1.3/s plus physics.friction and a 150px/s per-axis cap. Calibration at 1.5/s produced only 96.375px of one-second gravity movement; 1.3/s preserves 100.304px, meeting the existing >=100px requirement. The sustained-gravity climb and seed-1 bot survival regressions pass.

Both generated sources pass the new visible-effect check and their adjacent report files have been refreshed. Split-on-hit count differences reach 16/15/8 across seeds; center gravity mean matched-enemy offsets over the 900-tick comparison window are 366.61/368.17/286.57px, with count differences 8/9/7. All sample expected outcomes remain correct.

Quota errors are tested with fake runners and get no retry. Unexpected workspace files/directories are removed before verification, protected-file edits still fail, and simulated EBUSY cleanup errors are logged without replacing a verified result. npm test invokes no real Codex.

## Required checks

`npx tsc -b`: exit 0, no diagnostics.

`npm run lint`:

```text
> lint
> eslint .
```

Exit 0, no diagnostics.

## Full root npm test output

```text
> test
> npm run test --workspaces


> @patch-notes-live/engine@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/engine


 Test Files  4 passed (4)
      Tests  24 passed (24)
   Start at  13:00:39
   Duration  898ms (transform 162ms, setup 0ms, import 268ms, tests 767ms, environment 0ms)


> @patch-notes-live/harness@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/harness

VERIFY split-on-hit: PASS in 629.9ms, sandbox p95 0.082ms
VERIFY gravity-flip-every-10s: PASS in 760.0ms, sandbox p95 0.053ms
VERIFY floor-is-lava: PASS in 287.8ms, sandbox p95 0.000ms
VERIFY enemies-tiny-and-fast: PASS in 309.9ms, sandbox p95 0.052ms
VERIFY heal-on-kill: PASS in 299.5ms, sandbox p95 0.000ms
VERIFY infinite-loop: FAIL budget in 228.4ms
VERIFY throws-on-tick: FAIL stability in 399.2ms
VERIFY unbounded-spawner: FAIL runaway in 2429.8ms
VERIFY does-nothing: FAIL effect in 719.0ms
VERIFY instant-death: FAIL winnable in 33.1ms
GENERATED enemies-split-in-two-when-hit-2026-10-28T06-11-23-763Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.00px, mean enemy offset 0.00px, count difference 16, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 2: player max offset 0.60px, mean enemy offset 0.00px, count difference 15, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 3: player max offset 0.00px, mean enemy offset 0.00px, count difference 8, radius difference 0.00px, color false, physics false, arena false, UI events 0.
GENERATED gravity-pulls-everything-toward-the-center-2026-10-28T06-13-21-500Z.js: PASS; Visible effect in 900 ticks with the same seed and intents. Seed 1: player max offset 0.03px, mean enemy offset 366.61px, count difference 8, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 2: player max offset 0.23px, mean enemy offset 368.17px, count difference 9, radius difference 0.00px, color false, physics false, arena false, UI events 0; Seed 3: player max offset 4.09px, mean enemy offset 286.57px, count difference 7, radius difference 0.00px, color false, physics false, arena false, UI events 0.

 Test Files  3 passed (3)
      Tests  24 passed (24)
   Start at  13:00:40
   Duration  18.44s (transform 158ms, setup 0ms, import 522ms, tests 17.53s, environment 0ms)


> @patch-notes-live/mod-api@0.0.0 test
> vitest run --disableConsoleIntercept


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/mod-api

SANDBOX PERF: ticks=600 enemies=50 mods=3 mean=0.220ms p95=0.429ms onHitCalls=60
INSTRUCTION CALIBRATION: max=1/64 polls (1.56%)

 Test Files  4 passed (4)
      Tests  50 passed (50)
   Start at  13:00:59
   Duration  5.57s (transform 113ms, setup 0ms, import 218ms, tests 4.84s, environment 0ms)


> @patch-notes-live/overlay@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/overlay


 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  13:01:05
   Duration  231ms (transform 102ms, setup 0ms, import 134ms, tests 7ms, environment 0ms)


> @patch-notes-live/server@0.0.0 test
> vitest run


 RUN  v4.1.12 E:/Twitchcon hackathon/packages/server


 Test Files  2 passed (2)
      Tests  22 passed (22)
   Start at  13:01:05
   Duration  5.34s (transform 176ms, setup 0ms, import 379ms, tests 4.71s, environment 0ms)
```

Exit 0: 129 tests passed across all five workspaces.
