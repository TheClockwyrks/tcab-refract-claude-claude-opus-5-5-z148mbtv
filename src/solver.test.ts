import { describe, expect, it } from "vitest";
import { nodeAt, parseBoard } from "./board";
import { CAMPAIGN_BOARDS } from "./campaign-boards";
import type { BeamState, BoardState, Cell, Channel } from "./game";
import { seededRandom, plantBoard, tierSpec } from "./generator";
import { canExtend, isBeamComplete, isSolved, segmentKey } from "./rules";
import { isSolvable, measureBoard, solveBoard } from "./solver";

/**
 * An independent, unpruned enumeration over the state model and `rules.ts`,
 * which the optimized solver must agree with exactly.
 */
function bruteForce(board: BoardState): {
  solutions: number;
  branching: number;
  determined: number;
  routes: number[];
} {
  const channels = [
    ...new Set(board.nodes.map((n) => n.channel).filter((c) => c !== null)),
  ];
  const order: Channel[] = (["triangle", "square", "diamond"] as const).filter(
    (c) => channels.includes(c),
  );
  const emitters = (ch: Channel): Cell[] =>
    board.nodes
      .filter((n) => n.kind === "emitter" && n.channel === ch)
      .map((n) => ({ col: n.col, row: n.row }));
  const neighbors = (cell: Cell): Cell[] => {
    const out: Cell[] = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const col = cell.col + dc;
        const row = cell.row + dr;
        if ((dc || dr) && nodeAt(board, col, row)) out.push({ col, row });
      }
    }
    return out;
  };
  const keyOf = (beams: BeamState[]): string =>
    beams
      .map((b) =>
        b.cells
          .slice(1)
          .map((c, i) => segmentKey(b.cells[i], c))
          .sort()
          .join(","),
      )
      .join("|");

  const enumerate = (
    channelList: Channel[],
    accept: (beams: BeamState[]) => boolean,
    onFound: (beams: BeamState[], counts: number[]) => void,
  ): void => {
    const run = (index: number, beams: BeamState[], counts: number[]): void => {
      if (index === channelList.length) {
        if (accept(beams)) onFound(beams, counts);
        return;
      }
      const ch = channelList[index];
      const [start] = emitters(ch);
      const walk = (cells: Cell[], tally: number[]): void => {
        const current = [...beams, { channel: ch, cells }];
        const live = cells[cells.length - 1];
        if (cells.length > 1 && isBeamComplete(board, { channel: ch, cells })) {
          run(index + 1, current, tally);
          return;
        }
        const moves = neighbors(live).filter((n) =>
          canExtend(board, current, ch, live, n),
        );
        for (const n of moves) walk([...cells, n], [...tally, moves.length]);
      };
      walk([start], counts);
    };
    run(0, [], []);
  };

  const seen = new Map<string, number[]>();
  let common: Set<string> | null = null;
  enumerate(
    order,
    (beams) => isSolved(board, beams),
    (beams, counts) => {
      const key = keyOf(beams);
      if (seen.has(key)) return;
      seen.set(key, counts);
      const pairs = new Set(
        beams.flatMap((b) =>
          b.cells
            .slice(1)
            .map((c, i) => `${b.channel}:${segmentKey(b.cells[i], c)}`),
        ),
      );
      common =
        common === null
          ? pairs
          : new Set([...common].filter((p) => pairs.has(p)));
    },
  );
  const routes = order.map((ch) => {
    const found = new Set<string>();
    enumerate(
      [ch],
      () => true,
      (beams) => found.add(keyOf(beams)),
    );
    return found.size;
  });
  const tallies = [...seen.values()].flat();
  return {
    solutions: seen.size,
    branching: tallies.length
      ? tallies.reduce((a, b) => a + b, 0) / tallies.length
      : 0,
    determined: (common as Set<string> | null)?.size ?? 0,
    routes,
  };
}

function segmentCount(board: BoardState): number {
  let ends = 0;
  for (const n of board.nodes)
    ends +=
      n.kind === "emitter" ? 1 : n.kind === "lens" ? 2 : 2 * (n.charges ?? 0);
  return ends / 2;
}

describe("the solver", () => {
  it("solves every campaign board, with a solution the rules accept", () => {
    for (const lines of CAMPAIGN_BOARDS) {
      const board = parseBoard(lines);
      const solution = solveBoard(board);
      expect(solution).not.toBeNull();
      // Replay the solution move by move through the rules.
      const beams: BeamState[] = [];
      for (const beam of solution ?? []) {
        const drawn: BeamState = {
          channel: beam.channel,
          cells: [beam.cells[0]],
        };
        beams.push(drawn);
        for (const next of beam.cells.slice(1)) {
          const live = drawn.cells[drawn.cells.length - 1];
          expect(canExtend(board, beams, beam.channel, live, next)).toBe(true);
          (drawn.cells as Cell[]).push(next);
        }
      }
      expect(isSolved(board, beams)).toBe(true);
    }
  });

  it("finds the two pictures board 1 admits", () => {
    const m = measureBoard(parseBoard(CAMPAIGN_BOARDS[0]));
    expect(m.solutions).toBe(2);
    expect(m.minRoutes).toBe(2);
    expect(m.exhausted).toBe(false);
  });

  it("agrees with an unpruned enumeration on small boards", () => {
    const boards: BoardState[] = CAMPAIGN_BOARDS.slice(0, 11).map((b) =>
      parseBoard(b),
    );
    const random = seededRandom(7);
    for (const tier of [2, 3, 3, 4]) {
      const spec = tierSpec(tier);
      const planted = plantBoard(spec, 4, 4, random);
      if (planted !== null) boards.push(planted);
    }
    for (const board of boards) {
      const truth = bruteForce(board);
      const m = measureBoard(board);
      expect(m.solutions).toBe(truth.solutions);
      expect(m.minRoutes).toBe(Math.min(...truth.routes));
      expect(m.branching).toBeCloseTo(truth.branching, 10);
      expect(m.determinedShare).toBeCloseTo(
        truth.determined / segmentCount(board),
        10,
      );
    }
  });

  it("reports a board with no solution", () => {
    const board = parseBoard(["T.T"]);
    expect(isSolvable(board)).toBe(false);
    expect(solveBoard(board)).toBeNull();
    const m = measureBoard(board);
    expect(m.solutions).toBe(0);
    expect(m.minRoutes).toBe(0);
    expect(m.branching).toBe(0);
  });

  it("counts crystals two channels cross", () => {
    const board = parseBoard(["T2T", "S.S"]);
    const m = measureBoard(board);
    expect(m.solutions).toBe(1);
    expect(m.sharedCrystals).toBe(1);
    expect(m.determinedShare).toBe(1);
  });

  it("stops when its budget runs out", () => {
    const m = measureBoard(parseBoard(CAMPAIGN_BOARDS[23]), { budget: 10 });
    expect(m.exhausted).toBe(true);
  });
});
