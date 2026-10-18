# Refract

Refract is a light-tracing puzzle that runs entirely in the browser. Each board
is a lattice of optical nodes on a dark bench. Every channel of light — amber
triangles, cyan squares, rose diamonds — has two **emitters** (outlined shapes)
and any number of **lenses** (filled shapes). You draw each channel's beam by
pressing on a node and dragging from node to node: the beam must run from one
emitter to the other and thread every lens of its channel. Channel-neutral
**crystals** (hexagons) may be crossed by any beam, and every charge they carry
must be spent exactly. Moves that break the rules simply don't take.

Two modes are offered from the title menu:

- **Campaign** — 24 hand-built boards in four sets, unlocked one at a time.
- **Cascade** — an endless run of generated boards that climbs a five-tier
  difficulty ladder as you solve them. Every generated board is checked by an
  exhaustive solver against its tier's difficulty floor before you see it.

The game is built on the Simple 2D engine and draws everything in code: no art
or audio files, no network, no backend.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default <http://localhost:5173>).

## Production build

```sh
npm run build
```

This type-checks and writes a self-contained static site to `dist/`, with
`index.html` at its root. Serve that directory from any static file server, or
preview it locally with `npm run preview`.

## Controls

| Input                    | Does                                                         |
| ------------------------ | ------------------------------------------------------------ |
| Press and drag (mouse, pen, or touch) | Draws a beam from an emitter, or resumes it from either end; dragging back along a beam unwinds it. |
| Press on a node along a beam | Cuts the beam back to that node and continues from there. |
| `R`                      | Clears every beam on the board (also the on-screen CLEAR).   |
| `Esc`                    | Goes back (also the on-screen BACK).                         |
| Arrow keys / `WASD`      | Move the menu or board-grid highlight.                       |
| `Enter` / `Space`        | Take the highlighted choice.                                 |
| `M`                      | Mute or unmute sound.                                        |
| `` ` ``                  | Toggle the engine's debug overlay.                           |

Every menu also works with the pointer: hover or press to highlight, release on
the same item to take it.

## Development

- `npm test` — unit tests (Vitest, in Node, with coverage over `src/`).
- `npm run typecheck`, `npm run lint`, `npm run format` — the type, lint, and
  format checks.

The source lives in `src/`: `game.ts` (state types and the engine binding),
`rules.ts` (the beam rules), `trace.ts` (drawing with the pointer), `flow.ts`
(screens and menus), `solver.ts` and `generator.ts` (Cascade's boards),
`render.ts` and `draw.ts` (the look), and `debug.ts` (the automation surface).
