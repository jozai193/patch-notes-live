# Patch Notes Live — design system

Written before the UI implementation. The product is a playable changelog: a sentence
becomes a diff, the diff becomes code, and the code changes the game. It should feel
like opening the patch notes of a game whose developers are taking suggestions live.
Warm ink, generous type, editorial rules, and meaningful colored additions replace
the old spaceship dashboard. The arena supplies the spectacle; the UI supplies clarity.

## Color means something

`packages/overlay/src/tokens.css` will be the sole literal-color source for UI and
rendering. CSS uses custom properties. Canvas reads those properties once through
`tokens.ts`, outside the frame loop. Transparency derives from a token plus alpha;
it is never a new palette. Existing engine defaults have named compatibility tokens
so the renderer can map them without changing deterministic snapshots or cached mods.
Validated, intentional colors from mods remain data and override the default palette.

| Token          | Value     | Meaning                                                  | Contrast on surface |
| -------------- | --------- | -------------------------------------------------------- | ------------------: |
| `--background` | `#151413` | Warm ink, page and arena void                            |                   — |
| `--surface`    | `#211f1d` | The single raised surface in a region                    |                   — |
| `--text`       | `#f3eee5` | Main reading text and bright sprite details              |             14.21:1 |
| `--muted`      | `#b7b0a4` | Secondary text; never lowered with opacity               |              7.63:1 |
| `--you`        | `#72d8ed` | You, HP, your authorship, rule input focus               |              9.98:1 |
| `--danger`     | `#ff897d` | Enemies, damage, removed rules, errors, reverts          |              7.14:1 |
| `--good`       | `#95d6a4` | Pickups, healing, additions, verification passed         |              9.73:1 |
| `--change`     | `#f2c46d` | Hazards, physics/arena changes, warnings                 |             10.08:1 |
| `--ai`         | `#c6a5f7` | Codex generation, compile panel, patch headings, rewrite |              7.92:1 |
| `--patch-1`    | `#6afad8` | Mint patch identity                                      |             12.73:1 |
| `--patch-2`    | `#f1e03f` | Yellow patch identity                                    |             12.10:1 |
| `--patch-3`    | `#f23dfe` | Fuchsia patch identity                                   |              5.38:1 |
| `--patch-4`    | `#679b49` | Olive patch identity                                     |              4.98:1 |
| `--patch-5`    | `#b7f791` | Pale green patch identity                                |             13.08:1 |
| `--patch-6`    | `#ab81ba` | Mauve patch identity                                     |              5.15:1 |

Ratios use the WCAG relative-luminance formula, full-opacity text on the darkest
raised surface. Background contrast is higher. All text exceeds AA's 4.5:1 minimum;
primary buttons use background-colored text on the light semantic fill. Subtle grid,
dividers, halos and tint layers are decoration, never the sole carrier of information.

The categorical palette was screened in linear sRGB using Machado severity-1
protanopia, deuteranopia and tritanopia matrices, plus normal vision. The minimum
pairwise CIELAB distance across those simulations is approximately 31 (screening,
not a clinical guarantee). Matrix reference: [QGIS implementation citing Machado
et al.](https://api.qgis.org/api/qgsprevieweffect_8cpp_source.html). Each patch also
has a version number, name and numbered color slot. Never require hue identification
alone. Assign slots cyclically, skipping slots currently in use; retain the assignment
through restart and release it on removal. Cards, countdowns and spawned-entity
halos share the assignment. Do not repaint an entity's intentional mod color.

| UI / render element                                                      | Token and treatment                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Page, landing backdrop, arena outside walls                              | background                                               |
| Hero text, game title, body, wave/score/time, ship core                  | text                                                     |
| Help, attribution, clocks, dimensions, offline disclosure, no-match      | muted/text                                               |
| Play and Patch it actions, input focus, ship and HP                      | you; dark button text                                    |
| Your patch author label                                                  | you; explicit “you” label                                |
| Enemy silhouettes, floating damage, minus gutter and strikethrough       | danger                                                   |
| Pickup diamonds, plus gutter, passed checks                              | good                                                     |
| Hazard pools, changed walls, tilde gutter, desktop warning               | change                                                   |
| Codex compile heading, generation steps, patch card title, rewrite flash | ai                                                       |
| No-match feedback                                                        | surface + text/muted; no AI progress treatment           |
| Patch version row, left rule, countdown pill, spawn halo                 | assigned patch slot                                      |
| Patch note prose                                                         | text with semantic +/−/~ mark; code font                 |
| Revert banner and history row, validation errors                         | danger, explicit reason                                  |
| Main feed                                                                | background; dividing rules, not stacked bordered cards   |
| Rule composer / compile feedback                                         | one surface per region; semantic left rule               |
| Attract grid, vignette, trails, HP-bar track, HUD scrim                  | neutral/semantic tokens with alpha                       |
| Performance readout                                                      | surface + text; body numerals, no status-color invention |
| Onboarding and game-over                                                 | surface + text; primary action you                       |
| Illustrations: rule → code → checks → swap                               | you → ai → good → change                                 |

## Typography

Self-host the Latin subsets of **Bricolage Grotesque** (display, 600/800), **DM Sans**
(body, 400/500/600), and **IBM Plex Mono** (patch notes/code, 400/500) through their
approved `@fontsource` packages. No remote font requests. Use `font-display: swap`.
Canvas and DOM use the same named faces with system fallbacks.

| Role                     | Desktop size / line height | Phone                 |
| ------------------------ | -------------------------- | --------------------- |
| Landing display          | 80–104px / 1.02            | 48–56px / 1.05        |
| Section / game-over      | 32px / 1.15                | 28px / 1.2            |
| Game title / wave notice | 26px / 1.1                 | Game best on desktop  |
| HUD values               | 28px / 1.1                 | Scaled logical canvas |
| Lead                     | 20px / 1.5                 | 18px / 1.5            |
| Body / inputs / buttons  | 16px / 1.5                 | 16px / 1.5            |
| Notes and metadata       | 13–14px / 1.5              | 13–14px / 1.5         |
| HUD labels               | 14px / 1.4                 | Scaled with game      |

No tracked uppercase micro-labels. At most one optional eyebrow per screen:
“A game you can rewrite.” Sentence case everywhere else. Mono is reserved for actual
patch notes, versioned changelog lines and code, not navigation or generic labels.
Tabular numerals stabilize HP, timers and score without using mono.

## Copy

Say **HP, Wave, Score, Time, Autopilot, Patch notes, Try one, Patch it, Restart run**.
Explain what happened: “Codex is writing your rule”, “Checking three seeds”,
“Patch reverted: too slow”, “No match in archive”. No sector numbers, transmissions,
player integrity, telemetry, reality rollback, or filler superlatives. Funny notes
describe actual rules and stay family-friendly. Archive use is always disclosed.

## Layout

Landing: an open editorial page with a slim masthead, a large literal sentence diff,
two actions, a live dimmed/softened arena behind the hero, a horizontal changelog
ticker, and four unboxed explanation columns. At 390px the display wraps naturally,
actions stack and explanation columns become rows. No horizontal page overflow.

Game: retain the 1280×720 logical stage and fixed base-arena scale. The arena takes
roughly three quarters of the width; HP/Wave/Score/Time sit on its edges over a
neutral scrim, never a telemetry card. The remaining column is one continuous
versioned changelog. Each applied patch gets its version, semantic diff lines, author,
slot rule and countdown; reverts stay in history. Base v1.0 starts the feed.

The rule composer sits below the arena with a short “Try one” archive strip. Feedback
has a content-sized slot in the feed column, replacing spare feed space while open;
it never overlaps the arena, game-over card or banners and hides during game over.
No nested panel scrolling. Keep the 1280×720 / 1024×768 no-overflow regressions.
Use at most one elevated surface per region; spacing and a few editorial rules do
the rest. OBS skips landing, hides composer/help and keeps a transparent backdrop.

## Interaction and motion

The landing and the playable run are separate worlds. Attract mode uses the real
engine, bot and sandbox, applying an actual archived mod about every eight seconds.
The playable world remains at tick zero until Play. Enter activates Play unless a
different interactive control has focus. `?play=1` and `?obs=1` bypass landing.

Hero cycle: type a real base rule, show a danger minus row with the removed word
struck through, insert the good plus row, hold for reading, then crossfade to the next
archive example. Four examples: fleeing enemies, huge player, moon gravity, rainbow
enemies. Keep complete accessible text separate from animated fragments.

Play uses a short wipe/rewrite into the stable game masthead. Hover/focus transitions
last 120–180ms; content arrives over 180–240ms with ease-out. Patch rewrites remain
600ms; hue signals AI or danger, never random decoration. A moving cursor/scanline
is not needed. Honor `prefers-reduced-motion`: no typing, sliding ticker, shake,
tearing, rotating illustrations or drifting grid; use held text and crossfades instead.
Pause attract work when hidden and dispose its sandbox when Play is pressed.

## Acceptance

Polish details: the Play transition explicitly runs for 360ms (wipe), or 240ms
(opacity-only crossfade with reduced motion), before the simulation starts. The
diff rows share em-sized grid gutters, so their marks and text columns align.
“Try one” uses two rows of whole chips and a More control; the archive disclosure
lives beside “Archive · instant” instead of competing with the controls footer.
Patch cards sit below the wave banner. Applied archive feedback says “Applied”
and dismisses after two seconds. Your author label is “by you” in `--you`.

Changelog symbols come from reviewed `change: add | remove | change` metadata,
never title keywords. Archive collection preserves reviewed labels and kinds;
new candidates need manual classification after source review. Reverts are remove
events. The current archive adds entities/healing or changes existing tuning and
behavior; fleeing changes enemy behavior and is marked `~`.

- All existing game, sandbox, verifier and live/offline flows remain intact.
- Browser coverage: landing gate, Enter/Play, phone overflow, reduced motion, bypass
  flags, token contrast, patch identities, intentional mod colors and feedback fit.
- TypeScript, full root tests before each commit, lint and web build pass.
- Screenshots: desktop/390px landing, mid-diff headline, two-patch game, compile,
  revert. Measure the actual perf readout with 150+ entities and three patches;
  report FPS, frame p95 and sandbox time without rounding a missed target into a pass.
