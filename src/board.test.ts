import { describe, expect, it } from "vitest";
import {
  boardExtent,
  cellX,
  cellY,
  channelsPresent,
  formatBoard,
  nodeAt,
  nodeUnder,
  parseBoard,
} from "./board";
import { CAMPAIGN_BOARDS } from "./campaign-boards";
import { CAMPAIGN_LENGTH, NODE_HIT_R } from "./constants";

describe("cell geometry", () => {
  it("centers every board on the same point", () => {
    expect(cellX(0, 7)).toBe(352);
    expect(cellX(6, 7)).toBe(928);
    expect(cellY(0, 6)).toBe(152);
    expect(cellY(5, 6)).toBe(632);
    expect(cellX(1, 3)).toBe(640);
    expect(cellY(1, 3)).toBe(392);
    expect(cellX(0, 1)).toBe(640);
  });

  it("widens the extent by NODE_R on every side", () => {
    const board = parseBoard(["T.T"]);
    expect(boardExtent(board)).toEqual({ x: 514, y: 362, w: 252, h: 60 });
  });
});

describe("notation", () => {
  it("reads every character in reading order", () => {
    const board = parseBoard(["T.S", "1.s", "D2d", "t3."]);
    expect(board.cols).toBe(3);
    expect(board.rows).toBe(4);
    expect(
      board.nodes.map((n) => [n.col, n.row, n.kind, n.channel, n.charges]),
    ).toEqual([
      [0, 0, "emitter", "triangle", null],
      [2, 0, "emitter", "square", null],
      [0, 1, "crystal", null, 1],
      [2, 1, "lens", "square", null],
      [0, 2, "emitter", "diamond", null],
      [1, 2, "crystal", null, 2],
      [2, 2, "lens", "diamond", null],
      [0, 3, "lens", "triangle", null],
      [1, 3, "crystal", null, 3],
    ]);
  });

  it("round-trips through formatBoard", () => {
    for (const lines of CAMPAIGN_BOARDS)
      expect(formatBoard(parseBoard(lines))).toEqual(lines);
  });

  it("refuses what the notation does not define", () => {
    expect(() => parseBoard(["T.X"])).toThrow(/not board notation/);
    expect(() => parseBoard(["T.4"])).toThrow();
    expect(() => parseBoard(["T.T", "t."])).toThrow(/wide/);
    expect(() => parseBoard([])).toThrow();
    expect(() => parseBoard([""])).toThrow();
  });

  it("refuses a board larger than 7 x 6", () => {
    expect(() => parseBoard(["T......T"])).toThrow(/exceeds/);
    expect(() => parseBoard(Array.from({ length: 7 }, () => "t"))).toThrow(
      /exceeds/,
    );
    expect(
      parseBoard(Array.from({ length: 6 }, () => "t......")).nodes,
    ).toHaveLength(6);
  });
});

describe("lookups", () => {
  const board = parseBoard(["T.S", "1.s", "T.S"]);

  it("finds nodes by cell", () => {
    expect(nodeAt(board, 0, 1)?.kind).toBe("crystal");
    expect(nodeAt(board, 1, 1)).toBeUndefined();
  });

  it("lists the channels present in CHANNELS order", () => {
    expect(channelsPresent(board)).toEqual(["triangle", "square"]);
    expect(channelsPresent(parseBoard(["D.T", "d.T", "D.."]))).toEqual([
      "triangle",
      "diamond",
    ]);
  });

  it("targets a node within NODE_HIT_R of its center and no farther", () => {
    const x = cellX(0, 3);
    const y = cellY(0, 3);
    expect(nodeUnder(board, x + NODE_HIT_R, y)?.channel).toBe("triangle");
    expect(nodeUnder(board, x + NODE_HIT_R + 1, y)).toBeUndefined();
    expect(nodeUnder(board, cellX(1, 3), cellY(1, 3))).toBeUndefined();
  });
});

describe("the campaign", () => {
  it("holds the twenty-four boards", () => {
    expect(CAMPAIGN_BOARDS).toHaveLength(CAMPAIGN_LENGTH);
    expect(parseBoard(CAMPAIGN_BOARDS[23])).toMatchObject({ cols: 7, rows: 6 });
    expect(CAMPAIGN_BOARDS[0]).toEqual([".Tt", "ttT", ".tt"]);
  });
});
