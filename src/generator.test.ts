import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  MAX_CHARGES,
  MAX_TIER,
  TIERS,
} from "./constants";
import { channelsPresent } from "./board";
import {
  generateBoard,
  meetsFloor,
  plantBoard,
  seededRandom,
  tierFor,
  tierSpec,
} from "./generator";
import { isSolvable, measureBoard } from "./solver";

describe("the tier ladder", () => {
  it("climbs one rung every five boards and holds at the top", () => {
    expect([0, 4, 5, 9, 10, 19, 20, 24, 25, 400].map(tierFor)).toEqual([
      1, 1, 2, 2, 3, 4, 5, 5, 5, 5,
    ]);
  });

  it("clamps a tier onto the ladder", () => {
    expect(tierSpec(0).tier).toBe(1);
    expect(tierSpec(9).tier).toBe(MAX_TIER);
    expect(tierSpec(3)).toBe(TIERS[2]);
  });
});

describe("the generator", () => {
  for (const spec of TIERS) {
    it(`emits tier ${spec.tier} boards that meet the whole floor`, () => {
      const random = seededRandom(1000 + spec.tier);
      for (let i = 0; i < 4; i += 1) {
        const board = generateBoard(spec.tier, random);
        expect(board.cols).toBeGreaterThanOrEqual(spec.minCols);
        expect(board.cols).toBeLessThanOrEqual(
          Math.min(spec.maxCols, GRID_MAX_COLS),
        );
        expect(board.rows).toBeGreaterThanOrEqual(spec.minRows);
        expect(board.rows).toBeLessThanOrEqual(
          Math.min(spec.maxRows, GRID_MAX_ROWS),
        );
        expect(channelsPresent(board)).toEqual(
          CHANNELS.slice(0, spec.channels),
        );
        for (const channel of channelsPresent(board)) {
          const emitters = board.nodes.filter(
            (n) => n.kind === "emitter" && n.channel === channel,
          );
          expect(emitters).toHaveLength(2);
        }
        const crystals = board.nodes.filter((n) => n.kind === "crystal");
        expect(crystals.length).toBeGreaterThanOrEqual(spec.minCrystals);
        expect(crystals.length).toBeLessThanOrEqual(spec.maxCrystals);
        for (const crystal of crystals) {
          expect(crystal.charges).toBeGreaterThanOrEqual(spec.minCharges);
          expect(crystal.charges).toBeLessThanOrEqual(
            Math.min(spec.maxCharges, MAX_CHARGES),
          );
        }
        expect(
          board.cols * board.rows - board.nodes.length,
        ).toBeLessThanOrEqual(spec.maxEmptyCells);
        expect(isSolvable(board)).toBe(true);
        // Measured afresh with generous caps, so every figure is exact.
        const m = measureBoard(board, {
          solutionCap: 4096,
          routeCap: 4096,
          budget: 20_000_000,
        });
        expect(m.exhausted).toBe(false);
        expect(m.solutions).toBeGreaterThanOrEqual(spec.minSolutions);
        expect(m.solutions).toBeLessThanOrEqual(spec.maxSolutions);
        expect(m.minRoutes).toBeGreaterThanOrEqual(spec.minRoutes);
        expect(m.determinedShare).toBeLessThanOrEqual(spec.maxDeterminedShare);
        expect(m.branching).toBeGreaterThanOrEqual(spec.minBranching);
        expect(m.sharedCrystals).toBeGreaterThanOrEqual(spec.minSharedCrystals);
        expect(meetsFloor(board, m, spec)).toBe(true);
      }
    });
  }

  it("draws different boards on different dice", () => {
    const a = generateBoard(3, seededRandom(1));
    const b = generateBoard(3, seededRandom(2));
    expect(a).not.toEqual(b);
  });

  it("reproduces a board from the same seed", () => {
    expect(generateBoard(4, seededRandom(42))).toEqual(
      generateBoard(4, seededRandom(42)),
    );
  });

  it("refuses a tier off the ladder", () => {
    expect(() => generateBoard(0, Math.random)).toThrow(RangeError);
    expect(() => generateBoard(MAX_TIER + 1, Math.random)).toThrow(RangeError);
    expect(() => generateBoard(2.5, Math.random)).toThrow(RangeError);
  });

  it("gives up on a grid too small to plant", () => {
    expect(plantBoard(tierSpec(5), 1, 1, seededRandom(3))).toBeNull();
  });

  it("rejects a board outside its tier's shape", () => {
    const board = generateBoard(1, seededRandom(5));
    const m = measureBoard(board);
    expect(meetsFloor(board, m, tierSpec(1))).toBe(true);
    expect(meetsFloor(board, m, tierSpec(4))).toBe(false);
    expect(meetsFloor(board, { ...m, exhausted: true }, tierSpec(1))).toBe(
      false,
    );
  });
});
