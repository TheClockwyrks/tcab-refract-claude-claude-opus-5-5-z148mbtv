// The pointer targets each screen carries (specs/controls.md), and the layout
// they are drawn at. The renderer draws every control inside the rectangle
// listed here, and the pointer is hit-tested against the same rectangle, so a
// press at a target's center always takes it.

import type { DeepReadonly } from "ts-essentials";
import { CAMPAIGN_LENGTH, SOLVED_ITEMS, TITLE_ITEMS } from "./constants";
import { SET_SIZE } from "./campaign-boards";
import type { Box } from "./board";
import type { RefractState } from "./game";

export interface Target extends Box {
  readonly id: string;
}

/** The BACK control, top left on every screen that carries one. */
export const BACK_BOX: Box = { x: 32, y: 24, w: 168, h: 72 };

/** The CLEAR control on `playing`, on the left clear of any board. */
export const CLEAR_BOX: Box = { x: 32, y: 300, w: 168, h: 72 };

/** A vertical menu centered on the stage, as the title and complete screens draw it. */
const CENTER_MENU = { x: 460, y: 384, w: 360, h: 72, step: 88 };

/** The solved screen's menu, in a panel to the right of the largest board. */
export const SOLVED_PANEL: Box = { x: 976, y: 132, w: 280, h: 520 };
const SOLVED_MENU = { x: 992, y: 340, w: 248, h: 72, step: 88 };

/** The select grid: six boards to a row, one row per set. */
export const SELECT_GRID = {
  x: 372,
  y: 168,
  w: 100,
  h: 80,
  gapX: 16,
  gapY: 20,
};

/** The labels of the campaign's solved menu, in the order they are offered. */
export const CAMPAIGN_SOLVED_ITEMS = [
  "NEXT BOARD",
  "REPLAY",
  "BOARD SELECT",
] as const;

/** The complete screen's two choices. */
export const COMPLETE_ITEMS = ["BOARD SELECT", "TITLE"] as const;

function menuTargets(
  count: number,
  menu: { x: number; y: number; w: number; h: number; step: number },
): Target[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `menu-${i}`,
    x: menu.x,
    y: menu.y + i * menu.step,
    w: menu.w,
    h: menu.h,
  }));
}

/** The box of campaign board `index` (from 0) on the select grid. */
export function selectCell(index: number): Box {
  const col = index % SET_SIZE;
  const row = Math.floor(index / SET_SIZE);
  return {
    x: SELECT_GRID.x + col * (SELECT_GRID.w + SELECT_GRID.gapX),
    y: SELECT_GRID.y + row * (SELECT_GRID.h + SELECT_GRID.gapY),
    w: SELECT_GRID.w,
    h: SELECT_GRID.h,
  };
}

/** The labels of the solved screen's menu for the state's mode and board. */
export function solvedItems(
  state: DeepReadonly<RefractState>,
): readonly string[] {
  if (state.mode === "cascade") return SOLVED_ITEMS;
  return state.boardIndex < CAMPAIGN_LENGTH - 1
    ? CAMPAIGN_SOLVED_ITEMS
    : CAMPAIGN_SOLVED_ITEMS.slice(1);
}

/** The labels of the vertical menu the state's screen shows, if it has one. */
export function menuItems(
  state: DeepReadonly<RefractState>,
): readonly string[] {
  switch (state.screen) {
    case "title":
      return TITLE_ITEMS;
    case "solved":
      return solvedItems(state);
    case "complete":
      return COMPLETE_ITEMS;
    default:
      return [];
  }
}

/** The menu boxes the state's screen draws, index for index with `menuItems`. */
export function menuBoxes(state: DeepReadonly<RefractState>): Target[] {
  const count = menuItems(state).length;
  return menuTargets(
    count,
    state.screen === "solved" ? SOLVED_MENU : CENTER_MENU,
  );
}

/** The current screen's pointer targets, in the order specs/controls.md fixes. */
export function targetsFor(state: DeepReadonly<RefractState>): Target[] {
  switch (state.screen) {
    case "title":
    case "solved":
    case "complete":
      return menuBoxes(state);
    case "howto":
      return [{ id: "back", ...BACK_BOX }];
    case "select":
      return [
        ...Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => ({
          id: `board-${i + 1}`,
          ...selectCell(i),
        })),
        { id: "back", ...BACK_BOX },
      ];
    case "playing":
      return [
        { id: "clear", ...CLEAR_BOX },
        { id: "back", ...BACK_BOX },
      ];
  }
}

export function contains(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/** The target under a stage position, if any. */
export function targetAt(
  state: DeepReadonly<RefractState>,
  x: number,
  y: number,
): Target | undefined {
  return targetsFor(state).find((t) => contains(t, x, y));
}
