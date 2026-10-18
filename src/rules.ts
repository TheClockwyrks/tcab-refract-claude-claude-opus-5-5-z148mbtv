// The ruleset of specs/beams.md, read over a board and the beams drawn on it.
//
// The limits (R1 to R5) decide whether one segment may be added; the completion
// conditions (R6 to R8) and the solved test (R9) are derived from the beams and
// never refuse a move. Nothing here reads the renderer.

import type { DeepReadonly } from "ts-essentials";
import { channelsPresent, nodeAt, sameCell } from "./board";
import type { BeamState, BoardState, Cell, Channel, NodeState } from "./game";

type Board = DeepReadonly<BoardState>;
type Beams = DeepReadonly<BeamState[]>;
type CellRef = DeepReadonly<Cell>;

/** A segment's identity, the same whichever end it is named from. */
export function segmentKey(a: CellRef, b: CellRef): string {
  const first = a.row < b.row || (a.row === b.row && a.col < b.col);
  const [p, q] = first ? [a, b] : [b, a];
  return `${p.col},${p.row}-${q.col},${q.row}`;
}

/** Every segment of a beam, in drawn order. */
export function beamSegments(cells: readonly CellRef[]): [CellRef, CellRef][] {
  const out: [CellRef, CellRef][] = [];
  for (let i = 1; i < cells.length; i += 1) out.push([cells[i - 1], cells[i]]);
  return out;
}

/** How many segments meet a cell, summed over every beam. */
export function segmentsAt(beams: Beams, cell: CellRef): number {
  let count = 0;
  for (const beam of beams) {
    const n = beam.cells.length;
    beam.cells.forEach((c, i) => {
      if (!sameCell(c, cell)) return;
      if (i > 0) count += 1;
      if (i < n - 1) count += 1;
    });
  }
  return count;
}

/**
 * How many charges of a crystal are spent: the number of times its cell appears
 * across the beams, since a charge is spent on entry.
 */
export function spentAt(beams: Beams, cell: CellRef): number {
  let count = 0;
  for (const beam of beams) {
    for (const c of beam.cells) if (sameCell(c, cell)) count += 1;
  }
  return count;
}

export function isAdjacent(a: CellRef, b: CellRef): boolean {
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  return dc <= 1 && dr <= 1 && dc + dr > 0;
}

/** The diagonal crossing `a`-`b` inside their 2x2 block, or null if straight. */
export function crossingDiagonal(a: CellRef, b: CellRef): [Cell, Cell] | null {
  if (a.col === b.col || a.row === b.row) return null;
  return [
    { col: a.col, row: b.row },
    { col: b.col, row: a.row },
  ];
}

/** Every segment carried by any beam, by key. */
export function usedSegments(beams: Beams): Set<string> {
  const used = new Set<string>();
  for (const beam of beams) {
    for (const [a, b] of beamSegments(beam.cells)) used.add(segmentKey(a, b));
  }
  return used;
}

/** How many segments a node may carry under R5 (crystals are limited by entries instead). */
function segmentCap(node: DeepReadonly<NodeState>): number {
  if (node.kind === "emitter") return 1;
  if (node.kind === "lens") return 2;
  return Infinity;
}

/**
 * Whether the limits R1 to R5 let `channel`'s beam, whose live end is `from`,
 * add the segment to `to`, with every beam on the board as drawn.
 */
export function canExtend(
  board: Board,
  beams: Beams,
  channel: Channel,
  from: CellRef,
  to: CellRef,
): boolean {
  // R1: two distinct 8-adjacent nodes.
  if (!isAdjacent(from, to)) return false;
  const target = nodeAt(board, to.col, to.row);
  const source = nodeAt(board, from.col, from.row);
  if (target === undefined || source === undefined) return false;
  // R2: never an emitter or lens of another channel.
  if (target.kind !== "crystal" && target.channel !== channel) return false;
  // R3: each segment at most once, by at most one beam.
  const used = usedSegments(beams);
  if (used.has(segmentKey(from, to))) return false;
  // R4: the two diagonals of a 2x2 block exclude each other.
  const crossing = crossingDiagonal(from, to);
  if (crossing !== null && used.has(segmentKey(crossing[0], crossing[1]))) {
    return false;
  }
  // R5: capacity, at both ends of the new segment.
  if (segmentsAt(beams, from) + 1 > segmentCap(source)) return false;
  if (target.kind === "crystal") {
    return spentAt(beams, to) < (target.charges ?? 0);
  }
  return segmentsAt(beams, to) + 1 <= segmentCap(target);
}

/** R6 and R7: the beam runs emitter to emitter and threads every lens of its channel once. */
export function isBeamComplete(
  board: Board,
  beam: DeepReadonly<BeamState>,
): boolean {
  const cells = beam.cells;
  if (cells.length < 2) return false;
  const emitters = board.nodes.filter(
    (n) => n.kind === "emitter" && n.channel === beam.channel,
  );
  if (emitters.length !== 2) return false;
  const first = cells[0];
  const last = cells[cells.length - 1];
  const isEnd = (c: CellRef): boolean => emitters.some((e) => sameCell(e, c));
  if (!isEnd(first) || !isEnd(last) || sameCell(first, last)) return false;
  const single = [beam];
  for (const e of emitters) if (segmentsAt(single, e) !== 1) return false;
  return board.nodes
    .filter((n) => n.kind === "lens" && n.channel === beam.channel)
    .every((lens) => segmentsAt(single, lens) === 2);
}

/** R8: every charge spent, and no beam ends on the crystal. */
export function isCrystalSatisfied(
  beams: Beams,
  crystal: DeepReadonly<NodeState>,
): boolean {
  if (spentAt(beams, crystal) !== crystal.charges) return false;
  return beams.every((beam) => {
    const n = beam.cells.length;
    if (n === 0) return true;
    return (
      !sameCell(beam.cells[0], crystal) && !sameCell(beam.cells[n - 1], crystal)
    );
  });
}

/** The beam a board's channel carries, or an empty one. */
export function beamOf(
  beams: Beams,
  channel: Channel,
): DeepReadonly<BeamState> {
  return beams.find((b) => b.channel === channel) ?? { channel, cells: [] };
}

/** R9: every beam complete and every crystal satisfied. */
export function isSolved(board: Board, beams: Beams): boolean {
  const complete = channelsPresent(board).every((c) =>
    isBeamComplete(board, beamOf(beams, c)),
  );
  if (!complete) return false;
  return board.nodes
    .filter((n) => n.kind === "crystal")
    .every((n) => isCrystalSatisfied(beams, n));
}

/** One empty beam per channel present, in CHANNELS order. */
export function emptyBeams(board: Board): BeamState[] {
  return channelsPresent(board).map((channel) => ({ channel, cells: [] }));
}
