# Refract

## Overview

Refract is a puzzle game of light, played in the browser on a dark optical
bench. Each board is a lattice of optical nodes. The player draws one beam of
light per channel, each beam running between that channel's two emitters,
threading every lens of that channel and spending the charge in every crystal it
crosses.

Refract's defining idea is that a beam is drawn rather than fired. The player
presses on a node and traces, and the beam follows the pointer from node to
node while the rules silently refuse any move that would break them. A board is
solved when every beam is complete and every crystal is exactly spent.

Refract has its own name, look, and rules, and its assets, branding, and design
are original to it.

The specification spans several files under `specs/`. `specs/board.md` gives the
board, its cell geometry, and the notation boards are written in;
`specs/beams.md` the rules every beam obeys; `specs/controls.md` the pointer and
keyboard input and the targets every screen is worked through; `specs/state.md` what the game's state carries;
`specs/instrumentation.md` the debug and automation surface; `specs/ui.md` the
screens, the menus, and the audio cues; `specs/campaign-boards.md` the fixed set
of boards; and `specs/modes/campaign.md` and `specs/modes/cascade.md` the two
modes the game is played in. Read all of them and build the game they describe
as one cohesive whole.

## The runtime

The game is built on the Simple 2D engine, which documents itself in the
`engine/` directory at the root of this repository. It owns the frame loop and
the delta time the game is given, the input actions the screens are driven by,
the pointer the board and the screens are worked with, audio cues, asset
loading, the canvas fit, and the debug overlay. Read its documentation before you start. This
specification states only what is specific to Refract.

The pointer reaches the game from the engine already in the stage's logical
units, with its press and release edges and the device driving it, and the
engine takes the browser's own gestures on the canvas so a touch drag arrives
whole. `specs/controls.md` states what Refract does with them.

## The project you build in

The project at the root of this repository is already wired up, and its
`README.md` describes it. It is a TypeScript project built with Vite, tested
with Vitest, linted with ESLint, and formatted with Prettier. That toolchain is
fixed and supplied.

### What you implement

`src/game.ts`, and any new modules you add beside it under `src/`.

`src/game.ts` exports `game`, a `Game<RefractState, RefractDebugApi>`:
`initialize` builds the state and the debug surface once and returns them
together as `[state, debug]`, `update` takes the current state as a read-only
view (`DeepReadonly<RefractState>`) and returns the next state, advanced against
the frame's delta time in seconds, and `render` is handed that next state,
read-only again, and draws it. The engine holds the state by value and replaces
it with what each `update` returns, so a frame builds the next state from the
current one rather than writing into it, and nothing but `update` and the debug
surface's poses advances the game. All three functions throw `"not implemented"`
as they stand. Implement them.

`src/game.ts` also declares and exports `RefractState` and the types it is built
from, exactly as `specs/state.md` states them, and `RefractDebugApi`, the debug
and automation surface `specs/instrumentation.md` fixes.

`src/game.ts` also exports `BACKGROUND`, a CSS color string: the stage
background. `src/main.ts` hands it to the engine as the color the canvas is
cleared to each frame, so the letterbox bars around the stage match the bench
itself. The seeded stub exports a placeholder; replace it with the color your
bench uses.

### What stays as it is

- `src/main.ts`, the entry point. It stands the engine up over the page's canvas,
  binds `game` to it, and runs.
- `src/constants.ts`, holding every figure this specification fixes.
- `index.html`, the page and the canvas the engine fits the stage into.
- `.vendor/`, holding the vendored engine that `package.json` resolves the
  dependency from.
- `engine/`, the engine's own documentation.
- The configuration: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`,
  `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, and `.gitignore`.

`package.json` takes one kind of change: a dependency you genuinely need, added
along with the updated `package-lock.json`. Its existing entries and scripts stay
as they are.

### Every figure comes from `src/constants.ts`

Every number, identifier, key binding, cue name, and piece of screen copy this
specification fixes is exported from `src/constants.ts` under the name this
specification gives it. Import it and use it. Where a spec states a value it also
names the constant that holds it, and the constant is authoritative. Anything
this specification does not name is yours to decide.

### Your own tests

Write unit tests for what you build, beside your sources as `src/**/*.test.ts`.
`npm test` runs them in process with Vitest, in Node, with coverage measured
over `src/`. A test stands the engine up over its own canvas and clock and
advances the game a counted number of frames, so it needs no browser.

### The checks the repository passes

Four commands run over the finished repository before it is reviewed:

| Command | Checks |
| --- | --- |
| `npx tsc --noEmit` | The code type-checks. A repository that does not compile is not reviewed. |
| `npx eslint .` | The code is lint-clean. |
| `npx prettier --check .` | The code is formatted. |
| `npx vitest run --coverage` | Your tests pass, with their count and coverage reported. |

They run on the repository as you leave it. `npm run typecheck`, `npm run lint`,
`npm run format`, and `npm test` run the same four locally.

### The build interface

`npm ci` followed by `npm run build` produces the complete static site into
`dist/` at the repository root, with an `index.html` at the root of that
directory as the entry point. That directory runs correctly when served as-is at
the root of any static file server. The scripts that do this are already in
`package.json`.

## Goal of this build

Produce a complete, polished, playable game that runs entirely in a browser.
Aim for a game a person would enjoy playing.

The build ships both of the game's modes, and the player chooses between them
from the title menu. Campaign plays a fixed set of boards in order, and Cascade
plays generated boards without end. `specs/modes/campaign.md` and
`specs/modes/cascade.md` state each one. The board geometry, the beam rules, the
controls, and the debug surface the other spec files describe are the same in
both.

### Hard requirements

- Build on the Simple 2D engine, taking the frame loop, the input
  actions, the pointer, audio, and the debug overlay from it.
- Ship both modes, Campaign and Cascade, each reachable from the title menu.
- Render real graphics on the canvas, drawn as shapes and text.
- Draw everything in code. The build ships no art or audio files and fetches
  nothing at runtime.
- Run in the browser with no backend. Everything needed to play is
  self-contained, and no API key or credential is needed to build, run, or play.
- Hold the game's whole state in `RefractState`, as `specs/state.md` declares it.
- Replace the starter `README.md` with one explaining what the game is, how to
  install dependencies, how to run it in development, how to produce the static
  production build, and the controls.

## Code quality

The code is fit for a long-lived codebase shared with human developers. The
type-check, lint, and format checks pass, and unit tests cover the simulation.

## Coordinate system and presentation

All positions and sizes in this specification are given in the game's own
logical units on a fixed stage of `STAGE_W x STAGE_H` (`1280 x 720`, 16:9). The
origin `(0, 0)` is the top-left; `x` increases to the right and `y` increases
downward. The stage center is `(STAGE_CX, STAGE_CY)` (`640, 360`). Where the
board sits within the stage, and where each cell's center falls, are given in
`specs/board.md`.

- `STAGE_W x STAGE_H` is the game's logical design size. Fitting it to the
  browser window is the runtime's: the uniform scale that preserves the aspect
  ratio, the letterboxed centering, and the device pixel ratio. The complete
  stage is therefore on screen at every window size, on load and at any pixel
  density.
- The letterbox bars around the stage carry the stage's background color.
- Draw in logical units, and take the canvas element's own size from the runtime
  alone.
- Game logic operates in logical units, independent of the rendered scale. The
  pointer position the game is given is in those same units, so a hit test
  against a cell center needs no conversion.

Every rate in this specification is per second and every duration is in seconds,
integrated against the delta time the runtime hands each update.

## Visual design

The bench is dark. Choose the colors and the typography, decide how a node is
drawn and how a beam is rendered along the cells it links, and decide what sits
behind the board and how the board answers a beam as it grows.

`specs/board.md` states what a player must read at a glance from a node and a
beam, and `specs/ui.md` states the same for screen text.

The palette, type, glow, and every other aspect of the look are yours.
