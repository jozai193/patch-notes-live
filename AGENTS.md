# AGENTS.md: Patch Notes Live

You are building **Patch Notes Live**, a Twitch-integrated browser game where viewers propose rule changes in chat. Codex generates each rule as a sandboxed mod, a test harness verifies it, and it is hot-loaded into the running game.

**PLAN.md is the source of truth** for architecture, the mod API, harness invariants, and build steps. Read it before every task. If a task conflicts with PLAN.md, stop and say so. Don't silently deviate.

## How to work

- Work on **one PLAN.md step at a time**. The user will name the step. Don't start the next step unprompted.
- Before writing code, state in 3–6 bullets what you will create or change.
- A step is finished only when its **"Done when"** criteria in PLAN.md pass. Show the command output that proves it.
- After each finished step, commit with the message `step N: <summary>`.
- If something in PLAN.md turns out to be infeasible (library limitation, performance), report it with evidence and propose the smallest change. Don't work around it quietly.

## Stack and conventions

- Node 24, TypeScript (strict), ESM only, npm workspaces. No other package managers.
- Packages: `packages/engine`, `packages/mod-api`, `packages/harness`, `packages/overlay`, `packages/server`. Layout is in PLAN.md section 1.
- `packages/engine` must stay **DOM-free and deterministic**: no `Math.random`, `Date.now`, or `performance.now` inside game logic. Use the seeded RNG and tick counter.
- Tests use `vitest`. Every package has a `test` script, and the root `npm test` runs them all.
- Keep dependencies minimal. Ask before adding anything beyond: `typescript`, `vitest`, `vite`, `quickjs-emscripten`, `ws`, `@openai/codex-sdk`, `openai`, `dotenv`, `tsx`.
- Small files with focused modules. No `any` without a comment explaining why.

## Commands

- `npm install`: install all workspaces
- `npm test`: all tests
- `npm run dev`: overlay (Vite) and server together, once Step 8 exists
- `npm run patch -- "<rule text>"`: generate a mod via Codex, once Step 6 exists
- `npx tsc -b`: type-check everything

## The mod API is a contract

- `packages/mod-api/api.d.ts` is what runtime Codex patches are written against. Changing it breaks cached mods and the template, so propose changes before making them.
- Mods run **only** inside the QuickJS sandbox. Never `eval` mod code or run it with `new Function` in the host.
- The harness invariants in PLAN.md are safety guarantees. Don't weaken them to make a test pass.

## Security and secrets

- Never commit `.env`, tokens, or keys. Keep `.env.example` up to date with placeholder values.
- Treat all chat text as untrusted input: moderate it before display or use, length-limit it, and never interpolate it into shell commands.
- The runtime patch pipeline runs Codex with `--sandbox workspace-write` confined to `patches/<id>/`. Never give it access to the repo root.

## Out of scope unless asked

- Twitch Extensions, channel-point features, multiple games, accounts or databases, deployment to the cloud.
