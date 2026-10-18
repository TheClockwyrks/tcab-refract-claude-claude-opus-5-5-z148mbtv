# Refract — Debug and automation surface

Refract carries a small debugging and automation surface so the game can be driven
and inspected from code without moving a real pointer or waiting on real time.

You implement it. Every operation this file specifies is a deliverable, and the
build's `initialize` returns the finished surface beside the state it built, as
the pair `[state, debug]`. The engine returns that same value from `engine.debug`,
and it is reached that way alone: nothing is installed on the page. Every scenario
driven from code reaches the game through it, so it is present and exactly as
specified here.

Each operation is a reading or a pose of `RefractState`, written in the shape of
`update`, because the engine holds the state by value and nothing holds a writable
one. A pose takes the current state, as `DeepReadonly<RefractState>`, and returns
the next `RefractState`; a reading takes the state the same way and returns what
it read. Each pose sets one field, poses one board, or reports one pointer event;
`reset` and `clear` are the exceptions, and each is the whole of a behavior the
game already has. A caller drives a pose through the engine's `apply`, as
`engine.apply((s) => debug.clear(s))`, and a reading against the engine's current
state, as `debug.snapshot(engine.state)`. A pose arranges the board, and the
game's own targeting, grab rules, limits, and completion test run from there
exactly as they do in play, so a scenario driven from code behaves exactly like
one played by hand. `src/game.ts` declares and exports its type,
`RefractDebugApi`.

The surface is inert during normal play, doing nothing until something calls it.

## A render-free core

Game state advances from the elapsed simulation time the game is handed,
independent of a canvas, of the frame loop that measured it, and of wall-clock
time. Every rate is integrated against that delta time, so an interval of game
time reaches the same state however it was divided into frames, and a step means
the same thing whatever the frame rate. The dependency runs one way: the
simulation reads nothing from the renderer. Whether a segment may be added is
decided from the board and the beams alone, never from anything the renderer
holds.

## What the runtime provides instead

The clock, the keyboard, the pointer, and the overlay belong to the
Simple 2D engine, which documents them in the `engine/` directory at the
root of this repository, and the surface carries no operation for any of them.
The engine advances the game frame by frame and can take it off real time, it
drives the actions the game registers, it reports the pointer position in the
stage's logical units along with the press and release edges and the device
driving them, and it draws and toggles the debug overlay.

What the overlay shows is Refract's, under Diagnostics below.

The surface's pointer operations do not stand in for that pointer. They feed the
same input path it feeds, so a posed press and a player's press are the same event
to the game, and nothing is bypassed: the pointer targets, the hit radius, the
grab rules, and the limits all run exactly as they do for a player.

## The operations

The surface carries `version` (`REFRACT_DEBUG_VERSION`, `2`), a plain number, and
the operations below. Values are plain numbers, strings, and booleans. `x` and `y`
are in the stage's logical units, and `col` and `row` are cell coordinates as
`specs/board.md` defines them.

Every operation applies its effect every time it is called. Which screen is up,
what a player would have had to reach first, and where a board is in its run are
not an operation's conditions: a pose reaches the value it names whatever the
game's own rules would have allowed a player to reach, and `clear()` empties the
beams from wherever the game stands. A pose is never clamped, never snapped to a
nearer legal value, and never quietly dropped.

The pointer operations are not an exception to that. They report a pointer
rather than pose a field, so what the pointer meets — the hit radius, the targets
the screen carries, the grab rules, the limits — is the effect they were declared
to have, and it runs exactly as it runs for a player.

A call the game has nothing to act on fails loudly rather than passing quietly:
notation `specs/board.md` does not define, and a board wider than
`GRID_MAX_COLS` or taller than `GRID_MAX_ROWS`, each make `loadBoard` throw where
it stands. The one thing no operation does is refuse in silence, leaving the
state as it was and the caller nothing to read.

Each operation's first parameter is the current state,
`DeepReadonly<RefractState>`. A pose returns the next `RefractState`, built from
the one it was handed, which it leaves as it was; a reading returns what it read.
The headings below name the parameters that follow the state.

### `reset(state)`

Restores every declared field of the game's state to its title-screen value: the
title screen with its first menu item highlighted, `mode` back to `"campaign"`, no
board in play, every beam empty, no trace live, the pointer reported as up,
`simTime` at `0`, campaign progress cleared, so no board is recorded solved and
only the opening board is unlocked, and the cascade progression back to its
opening state, `solvedCount` at `0` and `tier` at `1`.

No pointer target is armed afterwards.

`muted` is untouched; the runtime owns muting.

### `snapshot(state)`

A pure reading of `state`, returned as the plain object under Snapshot shape
below. It returns no state, because it poses nothing.

### `reconcile(state)`

Brings every value this surface reports into agreement with the board as it now
stands, without advancing anything. A node's `x` and `y` follow the board's
dimensions, a crystal's `spent` follows the crossings the drawn beams have begun
on it, a beam's `complete` follows R6 and R7, `solved` follows R9, and `targets`
follows the current screen — so after a pose all five answer for the board as it
is now rather than as it was before it.

A build that works those out at the read has nothing to do here and this call
changes nothing. A build that keeps any of them as a stored copy rewrites that
copy from what it is a copy of.

It moves no clock and runs no system: `simTime` is untouched, no animation
advances, no frame is counted, and no board is generated. It plays no sound,
changes no screen, arms and disarms no target, begins and ends no trace, records
no board solved, and unlocks nothing. It moves nothing to make a reading agree: a
board posed onto a screen a player would never have reached it from reads as it
was posed, and neither the board nor the screen is moved to make the other
agreeable. Calling it twice leaves the same state as calling it once.

It is never an error and may be called on any screen, whether or not the game is
stepping itself.

`reconcile(state)` returns the next `RefractState`, built from the one it was
handed, which it leaves as it was. A build that works every one of those readings
out at the call returns a state equal to the one it was given.

### `setMode(state, mode)`

Sets `state.mode` to `"campaign"` or `"cascade"`, and sets its own field alone.
The screen, the board, the beams, the live trace, the progression of both modes,
`menuIndex`, `selectIndex`, and `simTime` are all left as they are. No board is
chosen and none is generated.

### `setScreen(state, screen)`

Sets `state.screen` to one of the six screen names `specs/state.md` declares, and
sets its own field alone. The mode, the board, the beams, the live trace, the
progression of both modes, `menuIndex`, `selectIndex`, and `simTime` are all left
as they are. No pointer target is armed afterwards, as when a screen is left in
play. The screen it sets then behaves exactly as `specs/ui.md`,
`specs/modes/campaign.md`, and `specs/modes/cascade.md` state for it.

### `setMenuIndex(state, index)`

Sets `state.menuIndex`, the highlighted item on whichever menu the current screen
shows, and sets its own field alone.

### `setSolvedCount(state, count)`

Sets `state.solvedCount`, the boards-solved count of the cascade run, to `count`,
a whole number from `0`, and sets its own field alone. `state.tier` is left as it
is.

### `setTier(state, tier)`

Sets `state.tier`, the tier the next cascade board is generated at, to `tier`, a
whole number from `1` to `MAX_TIER` (`5`), and sets its own field alone.
`state.solvedCount` is left as it is.

### `generateBoard(state, tier)`

Asks the generator in `specs/modes/cascade.md` for one board at `tier`, a whole
number from `1` to `MAX_TIER` (`5`), and poses it exactly as `loadBoard` poses a
board: the game moves to `playing` with that board in play, every beam empty, and
no trace live. The board is a board the generator emits for that tier, so it
meets every requirement the generator's contract and the tier's rows of the
ladder and the floor state. `mode`, `solvedCount`, `tier`, and every other field
are left as they are.

### `loadBoard(state, board)`

Poses an arbitrary board and moves to `playing` with every beam empty and no trace
live. `board` is the board notation `specs/board.md` defines, one string per row.
Boards up to `GRID_MAX_COLS` (`7`) by `GRID_MAX_ROWS` (`6`) are accepted, and cell
centers follow the formula in `specs/board.md`, so a posed board sits on the stage
exactly where a played board of the same dimensions would.

A board posed this way is a board like any other, and the rules in
`specs/beams.md` apply to it unchanged.

### `pointerDown(state, x, y, device)`, `pointerMove(state, x, y, device)`, `pointerUp(state, device)`

Report a press, a move, and a release at a logical stage position, from `device`,
which is `"mouse"`, `"pen"`, or `"touch"` and defaults to `"mouse"`. The three
drive the same path a player's pointer drives, so a posed touch and a posed mouse
differ only in the `device` the state reports.

On the screens that carry pointer targets the three operate those targets by
exactly the rules in `specs/controls.md`: a move highlights, a press highlights
and arms, and a release inside the armed target takes it.

On `playing`, outside that screen's targets, a press targets the node whose cell
center is within `NODE_HIT_R` (`44`) of `(x, y)` and begins a trace by exactly the
grab rules in `specs/controls.md`. A move extends the beam to an adjacent node, or
retracts it, under those same rules, and a move the limits refuse changes nothing
and leaves the trace live. The release ends the trace and leaves the beam as
drawn.

Each of the three **takes effect immediately**, when it is called, rather than
being sampled once per update. The press, the move, or the release is resolved
in the state the call returns rather than deferred to the next update. Each
returns the state that press, move, or release left behind, and the next call
is handed that state, so a whole route can be drawn from code without a frame
passing between the calls.

A move that satisfies R9 solves the board and ends the trace on the spot, as
`specs/beams.md` states. The release that follows begins nothing and changes
nothing.

### `clear(state)`

Carries out the `clear` action's own transaction as `specs/controls.md` states
it: every beam on the board is emptied and any live trace ends.

It never asks whether a player could have reached the action. Which screen is up
is how a player reaches `clear` — the action itself "is read on the `playing`
screen and does nothing on any other screen", as `specs/controls.md` fixes for
the key — and that is not this operation's condition, so `clear()` empties the
beams from wherever the game stands. A check about the action being unreachable
presses the key on the screen it is asking about; this operation is how a check
arrives at an emptied board.

## Snapshot shape

`snapshot` returns:

```js
{
  version: 2,
  screen: "title" | "howto" | "select" | "playing" | "solved" | "complete",
  mode: "campaign" | "cascade",
  menuIndex: <number>,         // the screen's highlighted menu item, from 0
  boardIndex: <number>,        // the campaign board being played, counted from 0
  solvedBoards: [<number>],    // the campaign indices solved so far, ascending
  unlockedCount: <number>,     // how many campaign boards are open to the player
  selectIndex: <number>,       // the board highlighted on select, counted from 0
  solvedCount: <number>,       // boards solved in the current cascade run
  tier: <number>,              // the tier the next cascade board is generated at
  board: {
    cols: <number>,
    rows: <number>,
    nodes: [
      { col, row, x, y,
        kind: "emitter" | "lens" | "crystal",
        channel: "triangle" | "square" | "diamond" | null,
        charges: <number | null>,
        spent: <number | null> },
    ],
  },
  beams: {
    // one entry per channel present
    triangle: { cells: [{ col, row }], complete: <boolean> },
  },
  solved: <boolean>,
  tracing: { channel: <string>, live: { col, row } } | null,
  pointer: { x: <number>, y: <number>, down: <boolean>,
             device: "mouse" | "pen" | "touch" },
  targets: [
    { id: <string>, x: <number>, y: <number>, w: <number>, h: <number> },
  ],
  muted: <boolean>,
  simTime: <number>,   // accumulated simulation time, in seconds
}
```

The shape is fixed, and every field is present whatever the mode is. `select` and
`complete` are screens Campaign reaches and Cascade does not, as
`specs/modes/campaign.md` and `specs/modes/cascade.md` state, and the six mode
fields belong four to Campaign and two to Cascade. Entering one mode changes no
field of the other, so a field of the mode not being played keeps the value that
mode last left it with, and reports the resting value below until its mode is
first entered in the session:

| Field | Resting value |
| --- | --- |
| `boardIndex` | `0` |
| `solvedBoards` | empty |
| `unlockedCount` | `1` |
| `selectIndex` | `0` |
| `solvedCount` | `0` |
| `tier` | `1` |

`menuIndex` is live on every screen with a menu and rests at `0` on `playing`.

`targets` lists the current screen's pointer targets, under the ids and in the
order `specs/controls.md` fixes for that screen, each with its top-left corner
and its size in the stage's logical units. A target's rectangle is the one the
game actually hit-tests against, so pressing at a listed target's center takes
that target.

Every field is read straight off the game's state, so what the snapshot reports is
what the game holds. Five are derived rather than stored:

| Field | Derived from |
| --- | --- |
| a node's `x`, `y` | the cell center formula in `specs/board.md` |
| a crystal's `spent` | the crossings the drawn beams have begun on it |
| a beam's `complete` | R6 and R7 in `specs/beams.md` |
| `solved` | R9 in `specs/beams.md` |
| `targets` | the current screen, under `specs/controls.md` |

A build is free to work any of these out at the read or to keep it as a stored
copy, and `reconcile()` is what brings a stored copy back into agreement after a
pose.

A node's `channel` is `null` for a crystal, and its `charges` and `spent` are
`null` for an emitter and for a lens. `beams` carries one entry per channel
present on the board and no entry for a channel the board does not use.

A beam's `cells` lists the cells its segments join, **in the order they were
drawn**, so the last cell is the end the most recent trace worked from and the one
a resumed trace extends. `tracing` is `null` whenever no trace is live, and
`tracing.live` names the cell of the live end, which is that last cell.

Three fields need the game to keep them honest every frame:

- `pointer` mirrors the position the pointer input reports, whether the pointer
  is currently pressed, and the device driving it, refreshed in every update.
- `muted` mirrors the runtime's mute bit, refreshed in every update, since the
  runtime owns muting and this is the game's readable copy of it.
- `simTime` accumulates the delta time of every update, whatever the screen.

## Diagnostics

The runtime's debug overlay shows the values the game registers with it as
diagnostic sources. Register at least the current `screen` and `mode`, the board's
`cols` and `rows`, each channel's beam length and whether it is complete, each
crystal's spent and total charges, whether the board is solved, and the pointer
position and its device, the same facts the snapshot reports. Keep each one short enough to read
on a line, and keep every source a pure read, so watching the overlay leaves the
game as it is.

Registering those values is the whole of Refract's part, through
`InitApi.diagnostics`. Each source is called with the state current at the read,
as `DeepReadonly<RefractState>`, and reads off that argument. Drawing the panel,
toggling it, and keeping it read-only are the engine's.
