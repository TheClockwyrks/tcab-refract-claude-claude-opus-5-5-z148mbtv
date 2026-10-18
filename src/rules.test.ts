import { describe, expect, it } from "vitest";
import { parseBoard } from "./board";
import type { BeamState, Cell, Channel } from "./game";
import {
  canExtend,
  emptyBeams,
  isBeamComplete,
  isCrystalSatisfied,
  isSolved,
  segmentKey,
  segmentsAt,
  spentAt,
} from "./rules";

const c = (col: number, row: number): Cell => ({ col, row });
const beam = (channel: Channel, ...cells: [number, number][]): BeamState => ({
  channel,
  cells: cells.map(([col, row]) => c(col, row)),
});

describe("segments", () => {
  it("names a segment the same from either end", () => {
    expect(segmentKey(c(1, 0), c(0, 1))).toBe(segmentKey(c(0, 1), c(1, 0)));
  });

  it("counts segments meeting a cell and charges spent", () => {
    const beams = [beam("triangle", [0, 0], [1, 0], [2, 1], [1, 0])];
    expect(segmentsAt(beams, c(1, 0))).toBe(3);
    expect(segmentsAt(beams, c(0, 0))).toBe(1);
    expect(spentAt(beams, c(1, 0))).toBe(2);
  });
});

describe("the limits", () => {
  it("R1: joins only 8-adjacent nodes, never across an empty cell", () => {
    const board = parseBoard(["T.t", "t.T"]);
    const beams = [beam("triangle", [0, 0])];
    expect(canExtend(board, beams, "triangle", c(0, 0), c(0, 1))).toBe(true);
    expect(canExtend(board, beams, "triangle", c(0, 0), c(2, 0))).toBe(false);
    expect(canExtend(board, beams, "triangle", c(0, 0), c(1, 0))).toBe(false);
    expect(canExtend(board, beams, "triangle", c(0, 0), c(0, 0))).toBe(false);
  });

  it("R2: never meets another channel's emitter or lens", () => {
    const board = parseBoard(["Ts", "St"]);
    const beams = [beam("triangle", [0, 0]), beam("square")];
    expect(canExtend(board, beams, "triangle", c(0, 0), c(1, 0))).toBe(false);
    expect(canExtend(board, beams, "triangle", c(0, 0), c(0, 1))).toBe(false);
    expect(canExtend(board, beams, "triangle", c(0, 0), c(1, 1))).toBe(true);
  });

  it("R3: a segment carries one beam, once", () => {
    const board = parseBoard(["T2T", "S.S"]);
    const beams = [beam("triangle", [0, 0], [1, 0]), beam("square", [0, 1])];
    expect(canExtend(board, beams, "square", c(0, 1), c(1, 0))).toBe(true);
    const crossing = [beam("triangle", [0, 0], [1, 0]), beam("square", [2, 1])];
    // The square beam may enter the crystal by its own segment...
    expect(canExtend(board, crossing, "square", c(2, 1), c(1, 0))).toBe(true);
    // ...but never re-use one already drawn.
    const looped = [beam("triangle", [0, 0], [1, 0], [2, 0])];
    expect(
      canExtend(parseBoard(["T2T"]), looped, "triangle", c(2, 0), c(1, 0)),
    ).toBe(false);
  });

  it("R4: the two diagonals of a 2x2 block exclude each other", () => {
    const board = parseBoard(["T2", "2T"]);
    const beams = [beam("triangle", [0, 0], [1, 1])];
    expect(
      canExtend(
        board,
        [beam("triangle", [0, 1])],
        "triangle",
        c(0, 1),
        c(1, 0),
      ),
    ).toBe(true);
    const both = [...beams];
    expect(canExtend(board, both, "triangle", c(1, 1), c(1, 0))).toBe(false);
    const other = parseBoard(["tS", "St"]);
    const drawn = [beam("triangle", [0, 0], [1, 1]), beam("square", [0, 1])];
    expect(canExtend(other, drawn, "square", c(0, 1), c(1, 0))).toBe(false);
  });

  it("R5: emitters carry one segment, lenses two, crystals their charges", () => {
    const board = parseBoard(["Tt1", "tT."]);
    const done = [beam("triangle", [0, 0], [1, 0], [0, 1], [1, 1])];
    // The far emitter already carries its segment.
    expect(canExtend(board, done, "triangle", c(1, 1), c(2, 0))).toBe(false);
    // A threaded lens takes no third segment.
    const through = [beam("triangle", [0, 0], [1, 0], [0, 1])];
    expect(canExtend(board, through, "triangle", c(0, 1), c(1, 0))).toBe(false);
    // A crystal with a charge left admits a beam; a spent one refuses it.
    const crystal = parseBoard(["T1t", "..T"]);
    const fresh = [beam("triangle", [2, 1], [2, 0])];
    expect(canExtend(crystal, fresh, "triangle", c(2, 0), c(1, 0))).toBe(true);
    const spent = [beam("triangle", [0, 0], [1, 0], [2, 0])];
    expect(spentAt(spent, c(1, 0))).toBe(1);
    expect(canExtend(crystal, spent, "triangle", c(2, 0), c(1, 1))).toBe(false);
    expect(
      canExtend(
        parseBoard(["T1", "1T"]),
        [beam("triangle", [0, 0], [1, 0], [0, 1])],
        "triangle",
        c(0, 1),
        c(1, 0),
      ),
    ).toBe(false);
    // An emitter that already carries a segment cannot be extended from.
    expect(
      canExtend(
        board,
        [beam("triangle", [1, 0], [0, 0])],
        "triangle",
        c(0, 0),
        c(0, 1),
      ),
    ).toBe(false);
  });

  it("refuses a move from or to a cell without a node", () => {
    const board = parseBoard(["T.", ".T"]);
    expect(
      canExtend(
        board,
        [beam("triangle", [0, 0])],
        "triangle",
        c(0, 0),
        c(1, 0),
      ),
    ).toBe(false);
    expect(
      canExtend(
        board,
        [beam("triangle", [1, 0])],
        "triangle",
        c(1, 0),
        c(1, 1),
      ),
    ).toBe(false);
  });
});

describe("the completion conditions", () => {
  const board = parseBoard(["T2T", "S.S"]);

  it("R6 and R7: emitter to emitter, every lens threaded", () => {
    const lensBoard = parseBoard(["Tt.", "..T"]);
    expect(
      isBeamComplete(lensBoard, beam("triangle", [0, 0], [1, 0], [2, 1])),
    ).toBe(true);
    expect(isBeamComplete(lensBoard, beam("triangle", [0, 0], [1, 0]))).toBe(
      false,
    );
    const skipped = parseBoard(["Tt", "T."]);
    expect(isBeamComplete(skipped, beam("triangle", [0, 0], [0, 1]))).toBe(
      false,
    );
    expect(isBeamComplete(skipped, beam("triangle"))).toBe(false);
    const lone = parseBoard(["Tt"]);
    expect(isBeamComplete(lone, beam("triangle", [0, 0], [1, 0]))).toBe(false);
  });

  it("R8: a crystal wants every charge spent and every crossing finished", () => {
    const crystal = board.nodes[1];
    const half = [beam("triangle", [0, 0], [1, 0], [2, 0])];
    expect(isCrystalSatisfied(half, crystal)).toBe(false);
    const full = [...half, beam("square", [0, 1], [1, 0], [2, 1])];
    expect(isCrystalSatisfied(full, crystal)).toBe(true);
    const ending = [...half, beam("square", [0, 1], [1, 0])];
    expect(isCrystalSatisfied(ending, crystal)).toBe(false);
  });

  it("R9: solved when every beam is complete and every crystal satisfied", () => {
    const full = [
      beam("triangle", [0, 0], [1, 0], [2, 0]),
      beam("square", [0, 1], [1, 0], [2, 1]),
    ];
    expect(isSolved(board, full)).toBe(true);
    expect(isSolved(board, full.slice(0, 1))).toBe(false);
    expect(isSolved(board, emptyBeams(board))).toBe(false);
  });

  it("gives one empty beam per channel present", () => {
    expect(emptyBeams(board)).toEqual([
      { channel: "triangle", cells: [] },
      { channel: "square", cells: [] },
    ]);
  });
});
