// The board: cell geometry, the notation boards are written in, and the small
// lookups every other module reads a board through (specs/board.md).

import type { DeepReadonly } from "ts-essentials";
import {
  BOARD_CX,
  BOARD_CY,
  CELL_PITCH,
  CHANNELS,
  GRID_MAX_COLS,
  GRID_MAX_ROWS,
  NODE_HIT_R,
  NODE_R,
} from "./constants";
import type { BoardState, Cell, Channel, NodeState } from "./game";

/** The empty board: what the state holds while no board is in play. */
export const NO_BOARD: BoardState = { cols: 0, rows: 0, nodes: [] };

/** The center of column `col` on a board `cols` wide. */
export function cellX(col: number, cols: number): number {
  return BOARD_CX - ((cols - 1) * CELL_PITCH) / 2 + col * CELL_PITCH;
}

/** The center of row `row` on a board `rows` tall. */
export function cellY(row: number, rows: number): number {
  return BOARD_CY - ((rows - 1) * CELL_PITCH) / 2 + row * CELL_PITCH;
}

/** An axis-aligned box in stage units. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The board's extent: the box its cell centers span, widened by NODE_R on every
 * side. Nothing but the board is drawn inside it on `playing`.
 */
export function boardExtent(board: DeepReadonly<BoardState>): Box {
  const x0 = cellX(0, board.cols) - NODE_R;
  const y0 = cellY(0, board.rows) - NODE_R;
  const x1 = cellX(board.cols - 1, board.cols) + NODE_R;
  const y1 = cellY(board.rows - 1, board.rows) + NODE_R;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const EMITTER_CHARS: Readonly<Record<string, Channel>> = {
  T: "triangle",
  S: "square",
  D: "diamond",
};

const LENS_CHARS: Readonly<Record<string, Channel>> = {
  t: "triangle",
  s: "square",
  d: "diamond",
};

/**
 * Reads a board written in the notation of specs/board.md. Throws on anything
 * the notation does not define and on a board outside GRID_MAX_COLS by
 * GRID_MAX_ROWS.
 */
export function parseBoard(lines: readonly string[]): BoardState {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("Refract: a board needs at least one row");
  }
  const rows = lines.length;
  const cols = typeof lines[0] === "string" ? lines[0].length : 0;
  if (cols === 0) throw new Error("Refract: a board needs at least one column");
  if (cols > GRID_MAX_COLS || rows > GRID_MAX_ROWS) {
    throw new Error(
      `Refract: a ${cols} x ${rows} board exceeds ${GRID_MAX_COLS} x ${GRID_MAX_ROWS}`,
    );
  }
  const nodes: NodeState[] = [];
  lines.forEach((line, row) => {
    if (typeof line !== "string" || line.length !== cols) {
      throw new Error(`Refract: board row ${row} is not ${cols} cells wide`);
    }
    for (let col = 0; col < cols; col += 1) {
      const ch = line[col];
      if (ch === ".") continue;
      if (ch in EMITTER_CHARS) {
        nodes.push({
          col,
          row,
          kind: "emitter",
          channel: EMITTER_CHARS[ch],
          charges: null,
        });
      } else if (ch in LENS_CHARS) {
        nodes.push({
          col,
          row,
          kind: "lens",
          channel: LENS_CHARS[ch],
          charges: null,
        });
      } else if (ch === "1" || ch === "2" || ch === "3") {
        nodes.push({
          col,
          row,
          kind: "crystal",
          channel: null,
          charges: Number(ch),
        });
      } else {
        throw new Error(`Refract: "${ch}" is not board notation`);
      }
    }
  });
  return { cols, rows, nodes };
}

/** Writes a board back out in notation, one string per row. */
export function formatBoard(board: DeepReadonly<BoardState>): string[] {
  const grid = Array.from({ length: board.rows }, () =>
    Array.from({ length: board.cols }, () => "."),
  );
  for (const node of board.nodes) {
    let ch: string;
    if (node.kind === "crystal") ch = String(node.charges);
    else {
      const letter = (node.channel ?? "triangle")[0];
      ch = node.kind === "emitter" ? letter.toUpperCase() : letter;
    }
    grid[node.row][node.col] = ch;
  }
  return grid.map((row) => row.join(""));
}

/** The node at a cell, or `undefined` for an empty cell or a cell off the board. */
export function nodeAt(
  board: DeepReadonly<BoardState>,
  col: number,
  row: number,
): DeepReadonly<NodeState> | undefined {
  return board.nodes.find((n) => n.col === col && n.row === row);
}

/** The channels present on a board, in CHANNELS order. */
export function channelsPresent(board: DeepReadonly<BoardState>): Channel[] {
  return CHANNELS.filter((c) => board.nodes.some((n) => n.channel === c));
}

/** The node the pointer at `(x, y)` targets, if any (specs/controls.md). */
export function nodeUnder(
  board: DeepReadonly<BoardState>,
  x: number,
  y: number,
): DeepReadonly<NodeState> | undefined {
  return board.nodes.find(
    (n) =>
      Math.hypot(x - cellX(n.col, board.cols), y - cellY(n.row, board.rows)) <=
      NODE_HIT_R,
  );
}

export function sameCell(
  a: DeepReadonly<Cell>,
  b: DeepReadonly<Cell>,
): boolean {
  return a.col === b.col && a.row === b.row;
}
