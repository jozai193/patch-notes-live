# Patch Notes Live

## One-line Summary

Type a rule. AI writes, verifies and hot-swaps real game code while you keep playing.

## Problem

Most games let players choose from rules the developer already wrote. I wanted to
try something different: what if a player's sentence could become the next patch?
The challenge is making that freedom work without letting generated code freeze
the game, delete the player, or silently do nothing.

## Solution

Patch Notes Live is an arena survival game where the rule box is part of the game.
Ask for enemies that flee, a huge player, or a shrinking arena. In local mode,
Codex writes a JavaScript mod, the server independently verifies it, and the game
loads it without restarting. Each accepted patch gets a version, an author and a
countdown in the patch-notes feed.

The public demo includes 25 archived patches so judges can try the idea immediately,
without an account, API key or server. Archive use is clearly labelled. It is not
presented as live generation.

## Why This Matters

The player becomes a collaborator in the game's design. A small typed API gives
the model enough freedom to create new behaviors, while a verifier and isolated
runtime keep the interaction bounded. It is also an example of AI doing useful
work inside a running product, rather than just generating its initial code.

## How We Used AI

The local server uses the Codex SDK to create one mod for each requested rule.
Each request gets a fresh temporary workspace outside the repository. The model
receives the mod API, worked examples, and the player's suggestion as quoted,
untrusted data. It can edit `mod.js` and run the trusted harness. One repair retry
is allowed when independent verification reports a failure.

The server reruns verification itself before publishing. It checks loading/schema
and size, stability, instruction budget, runaway entities, bot survival, visible
effect, and deterministic replay. Every patch then runs in its own QuickJS WASM
runtime, with memory and instruction limits and no browser or network access.
A live watchdog reverts disabled or slow patches.

## How We Used Codex

Codex helped build and test the deterministic engine, sandbox, verifier, patch
pipeline, renderer and browser UI. Iteration exposed problems that ordinary
happy-path testing missed: wall-clock budgets could make identical runs diverge;
steering could erase mod-applied forces; and a patch could technically change a
snapshot without visibly changing the game. The resulting fixes use deterministic
interrupt budgets, external movement drift, and measured visible-effect checks.

Codex is also a runtime dependency of local live patching. The browser archive
contains both handwritten seed examples and previously generated, independently
verified mods. Automated tests use fake Codex runners and do not spend generation
quota.

## Key Features

- A playable survival game with keyboard/mouse controls and autopilot while typing.
- Live code generation, streamed compile progress, independent verification and hot-swap.
- Three simultaneous patches, versioned patch notes and automatic expiry.
- Per-mod isolation and a live fault/performance watchdog.
- An instant static web demo with 25 verified archive patches.
- Procedural canvas visuals, a responsive landing page and reduced-motion support.

## Architecture

TypeScript ESM in five npm workspaces: engine, mod API/sandbox, harness, overlay
and server. The same seeded 60Hz engine runs in the browser and Node verifier.
The overlay uses Vite and Canvas; a local WebSocket hub coordinates generation
and patch delivery. The public static build bundles the archive and release-sync
QuickJS WASM, with no credentials or live-generation server exposed.

## Testing Instructions

For the public demo, press Play, then enter “make the player huge” or click a
patch under Try one. Try three patches, then a fourth to see the oldest expire.
Use B for autopilot and R to restart while retaining patches.

For live AI generation, use Node 24, clone the repository, run `npm i`, authenticate
with `codex login` (or set `CODEX_API_KEY`), then run `npm run dev`. Open
http://localhost:5173 and request “enemies run away from you”. The panel shows
generation/testing progress before the patch is applied.

Validation commands: `npx tsc -b`, `npm test`, `npm run lint`, and
`npm run build:web` (which also runs the full archive verifier).

The recorded 20-request generation benchmark accepted 18/18 game rules on the
first attempt and correctly rejected both non-game requests. Median duration was
62.85 seconds; combined p90 was 82.81 seconds. These are recorded local results,
not a promise for every request or model.

## Public Demo Link

https://jozai193.github.io/patch-notes-live/

## Public Repository Link

https://github.com/jozai193/patch-notes-live

## Demo Video

**YouTube (unlisted, accessible by link):** https://youtu.be/YeVphAUuCAU

The narrated 1080p MP4 and captions are also packaged as release assets:
https://github.com/jozai193/patch-notes-live/releases/tag/demo-v1

The YouTube upload was confirmed in Studio as **Video published**, with unlisted
visibility and no issues reported by its upload checks. It uses Deepgram Aura 2
Apollo narration, timed captions and original locally synthesized background audio.

## Screenshot Shot List

- Landing page: `docs/screenshots/redesign/landing-desktop.png`.
- Two running patches: `docs/screenshots/redesign/game-two-patches.png`.
- Fresh live compile/apply: `docs/submission/live-compiling.png` and `live-applied.png`.
- Three archive patches and expiry: `docs/submission/three-patches.png` and `fourth-patch.png`.

## Submission Readiness Notes

Prepared for Arbiter Hacks V1, General Track. Nothing has been submitted to Devpost.
The connected account did not list Arbiter among its registered events when
checked on November 22. Registration, rules acknowledgement, and final approval
are still needed. Do not claim a registration or submission confirmation without
checking Devpost live.

## Known Limitations

New rules require local Codex authentication/quota and can take up to 150 seconds.
The static demo matches a finite archive and cannot invent new code. Verification
is bounded to three seeds and a fixed simulation window; it does not prove
unlimited safety or compatibility of every combination. The watchdog is a backstop,
not a substitute for isolation. Twitch, accounts, comprehensive moderation and
public hosting of live AI generation are outside the current scope.

## What I'd Do Next

Gather player feedback on which rule combinations are fun, improve diagnostic
messages for rejected rules, and extend compatibility tests for interacting mods.
Any public live-generation service would need authentication, abuse controls and
an explicit operating budget before deployment.

## TODO Official Form Fields

The fetched event requirements contained no custom submission questions. Confirm
the final form after registration; do not invent additional official fields.
