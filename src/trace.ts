// Drawing a beam with the pointer: beginning a trace, extending and retracting
// it, and releasing it (specs/controls.md). Each function takes the board's
// beams and returns the next ones, reporting what happened through `Effects`.

import type { DeepReadonly } from "ts-essentials";
import { CHANNELS, CUES } from "./constants";
import type { CueName } from "./constants";
import { nodeUnder, sameCell } from "./board";
import type { BeamState, BoardState, Cell, Channel, TraceState } from "./game";
import { beamOf, canExtend, isBeamComplete } from "./rules";

/** What a transition raised beyond the state it returned. */
export interface Effects {
  /** The cues raised, each played at most once per frame. */
  readonly cues: Set<CueName>;
}

export function newEffects(): Effects {
  return { cues: new Set() };
}

/** The beams and the live trace: the part of the state a trace edits. */
export interface Drawing {
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;
}

type Board = DeepReadonly<BoardState>;
type Beams = DeepReadonly<BeamState[]>;

function withCells(
  beams: Beams,
  channel: Channel,
  cells: readonly Cell[],
): BeamState[] {
  return beams.map((b) =>
    b.channel === channel
      ? { channel, cells: cells.map((c) => ({ ...c })) }
      : copyBeam(b),
  );
}

function copyBeam(beam: DeepReadonly<BeamState>): BeamState {
  return {
    channel: beam.channel,
    cells: beam.cells.map((c) => ({ col: c.col, row: c.row })),
  };
}

function cellOf(node: { col: number; row: number }): Cell {
  return { col: node.col, row: node.row };
}

/**
 * A press at `(x, y)`: begins a trace by the first row of specs/controls.md's
 * table the targeted node matches, or begins nothing.
 */
export function beginTrace(
  board: Board,
  beams: Beams,
  x: number,
  y: number,
  fx: Effects,
): Drawing {
  const node = nodeUnder(board, x, y);
  const unchanged: Drawing = { beams: beams.map(copyBeam), tracing: null };
  if (node === undefined) return unchanged;
  const cell = cellOf(node);

  // An emitter of a channel whose beam carries no segments starts that beam.
  if (node.kind === "emitter" && node.channel !== null) {
    const beam = beams.find((b) => b.channel === node.channel);
    if (beam !== undefined && beam.cells.length < 2) {
      return {
        beams: withCells(beams, beam.channel, [cell]),
        tracing: { channel: beam.channel },
      };
    }
  }

  // Either end of a beam resumes it from that end.
  for (const channel of CHANNELS) {
    const beam = beams.find((b) => b.channel === channel);
    if (beam === undefined || beam.cells.length < 2) continue;
    const last = beam.cells[beam.cells.length - 1];
    if (sameCell(last, cell)) {
      return { beams: beams.map(copyBeam), tracing: { channel } };
    }
    if (sameCell(beam.cells[0], cell)) {
      return {
        beams: withCells(beams, channel, [...beam.cells].reverse()),
        tracing: { channel },
      };
    }
  }

  // A node exactly one beam passes through shortens that beam to end there.
  const through = beams.filter(
    (b) => b.cells.length >= 2 && b.cells.some((c) => sameCell(c, cell)),
  );
  if (through.length === 1) {
    const beam = through[0];
    let lastIndex = -1;
    beam.cells.forEach((c, i) => {
      if (sameCell(c, cell)) lastIndex = i;
    });
    if (lastIndex < beam.cells.length - 1) fx.cues.add(CUES.retract);
    return {
      beams: withCells(beams, beam.channel, beam.cells.slice(0, lastIndex + 1)),
      tracing: { channel: beam.channel },
    };
  }
  return unchanged;
}

/**
 * The pointer moving to `(x, y)` during a trace: retracts onto the node behind
 * the live end, or extends to an adjacent node the limits permit.
 */
export function moveTrace(
  board: Board,
  drawing: DeepReadonly<Drawing>,
  x: number,
  y: number,
  fx: Effects,
): Drawing {
  const beams = drawing.beams.map(copyBeam);
  const tracing =
    drawing.tracing === null ? null : { channel: drawing.tracing.channel };
  if (tracing === null) return { beams, tracing };
  const node = nodeUnder(board, x, y);
  if (node === undefined) return { beams, tracing };
  const cell = cellOf(node);
  const beam = beamOf(beams, tracing.channel);
  const cells = beam.cells;
  if (cells.length === 0) return { beams, tracing };
  const live = cells[cells.length - 1];
  if (sameCell(live, cell)) return { beams, tracing };

  if (cells.length >= 2 && sameCell(cells[cells.length - 2], cell)) {
    fx.cues.add(CUES.retract);
    return {
      beams: withCells(beams, tracing.channel, cells.slice(0, -1)),
      tracing,
    };
  }

  if (!canExtend(board, beams, tracing.channel, live, cell))
    return { beams, tracing };
  const wasComplete = isBeamComplete(board, beam);
  const next = withCells(beams, tracing.channel, [...cells, cell]);
  fx.cues.add(CUES.connect);
  if (!wasComplete && isBeamComplete(board, beamOf(next, tracing.channel))) {
    fx.cues.add(CUES.channelComplete);
  }
  return { beams: next, tracing };
}

/**
 * The release edge: the trace ends and the beam stays as drawn, except that a
 * beam left with no segment is left with no cells at all.
 */
export function releaseTrace(drawing: DeepReadonly<Drawing>): Drawing {
  return {
    beams: drawing.beams.map((b) =>
      b.cells.length < 2 ? { channel: b.channel, cells: [] } : copyBeam(b),
    ),
    tracing: null,
  };
}

/** Whether any beam carries a segment. */
export function hasSegments(beams: Beams): boolean {
  return beams.some((b) => b.cells.length >= 2);
}
