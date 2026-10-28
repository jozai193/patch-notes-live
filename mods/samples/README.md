# Sample mods

These are ES-module **source files for QuickJS**, not host-side plugins. The verifier reads them as text and never imports or evaluates them in Node.

| File                      | Expected result | Behavior                                                                                                                                                                                    |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| split-on-hit.js           | pass            | An enemy shot creates two smaller children, which cannot split again.                                                                                                                       |
| gravity-flip-every-10s.js | pass            | Gentle gravity changes sign each ten seconds; damping leaves movement controllable.                                                                                                         |
| floor-is-lava.js          | pass            | Six stationary hazard tiles leave wide safe corridors.                                                                                                                                      |
| enemies-tiny-and-fast.js  | pass            | Enemy circles shrink and speed increases by 25%.                                                                                                                                            |
| heal-on-kill.js           | pass            | Enemy kills restore up to five HP; mint player color provides visible feedback even at full HP.                                                                                             |
| infinite-loop.js          | fail: budget    | The sandbox interrupts the loop; the literal loop also fails the static load policy.                                                                                                        |
| throws-on-tick.js         | fail: stability | It indexes an empty enemy array before the first wave exists.                                                                                                                               |
| unbounded-spawner.js      | fail: runaway   | It creates permanent pickups across the arena, filling the entity cap over time. Each call stays within the sandbox's spawn limit so this exercises accumulation rather than a burst fault. |
| does-nothing.js           | fail: effect    | Only private scratch state changes, leaving the game identical to baseline.                                                                                                                 |
| instant-death.js          | fail: winnable  | It sets player HP to zero onStart.                                                                                                                                                          |

```sh
npm run verify -- mods/samples/split-on-hit.js
npm run verify -- mods/samples/throws-on-tick.js --json
```

Three good examples are included in `mod-template/AGENTS.md` alongside the runtime patch instructions.

`time-bomb.js` intentionally **passes** the 60-second harness, then throws when game time exceeds 70 seconds. The live watchdog removes it after the sandbox auto-disables it (three consecutive throws), and displays the first fault message. This is a demonstration of the verifier's finite horizon, not a guarantee that a passing source stays safe forever. Apply it early in a fresh run with bot mode enabled to watch the backstop at about 70 seconds. Its onStart toast makes the patch visible during verification.
