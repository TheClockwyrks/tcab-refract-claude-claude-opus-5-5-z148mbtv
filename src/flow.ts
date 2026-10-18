// The screen machine (specs/ui.md, specs/modes/campaign.md,
// specs/modes/cascade.md): every transition between screens, the menus, the
// pointer operating the targets, and the frame-level input handling that
// `update` and the debug surface share.

import type { DeepReadonly } from "ts-essentials";
import { CAMPAIGN_LENGTH, CUES, MAX_TIER, TITLE_ITEMS } from "./constants";
import { SET_SIZE, CAMPAIGN_BOARDS } from "./campaign-boards";
import { NO_BOARD, parseBoard } from "./board";
import type { BoardState, PointerDevice, RefractState, Screen } from "./game";
import { generateBoard, tierFor } from "./generator";
import type { Random } from "./generator";
import { emptyBeams, isSolved } from "./rules";
import { menuItems, targetAt } from "./targets";
import type { Effects } from "./trace";
import { beginTrace, hasSegments, moveTrace, releaseTrace } from "./trace";

type State = DeepReadonly<RefractState>;

/** What a transition may reach beyond the state: cues and the generator's dice. */
export interface FlowEffects extends Effects {
  readonly random: Random;
}

/** A plain copy of a read-only state, so a transition can return it as the next one. */
export function copyState(s: State): RefractState {
  return {
    ...s,
    board: {
      cols: s.board.cols,
      rows: s.board.rows,
      nodes: s.board.nodes.map((n) => ({ ...n })),
    },
    beams: s.beams.map((b) => ({
      channel: b.channel,
      cells: b.cells.map((c) => ({ ...c })),
    })),
    tracing: s.tracing === null ? null : { ...s.tracing },
    solvedBoards: [...s.solvedBoards],
    pointer: { ...s.pointer },
  };
}

/** The title-screen state every session opens on. */
export function initialState(muted = false): RefractState {
  return {
    screen: "title",
    mode: "campaign",
    menuIndex: 0,
    board: NO_BOARD,
    beams: [],
    tracing: null,
    boardIndex: 0,
    solvedBoards: [],
    unlockedCount: 1,
    selectIndex: 0,
    solvedCount: 0,
    tier: 1,
    pointer: { x: 0, y: 0, down: false, device: "mouse" },
    armedTarget: null,
    simTime: 0,
    muted,
  };
}

/** Moves to `screen`, ending any live trace and disarming whatever was armed. */
export function goTo(s: State, screen: Screen, menuIndex = 0): RefractState {
  const base = copyState(s);
  const drawing = s.tracing === null ? {} : releaseTrace(s);
  return { ...base, ...drawing, screen, menuIndex, armedTarget: null };
}

/** Poses `board` on `playing` with every beam empty and no trace live. */
export function playBoard(s: State, board: BoardState): RefractState {
  return {
    ...goTo(s, "playing"),
    board,
    beams: emptyBeams(board),
    tracing: null,
  };
}

/** Enters campaign board `index` (from 0), fresh. */
export function enterCampaignBoard(s: State, index: number): RefractState {
  return {
    ...playBoard(s, parseBoard(CAMPAIGN_BOARDS[index])),
    boardIndex: index,
    selectIndex: index,
  };
}

/** Arrives at the select grid, the highlight on the board last entered or solved. */
export function toSelect(s: State): RefractState {
  return {
    ...goTo(s, "select"),
    beams: emptyBeams(s.board),
    selectIndex: s.boardIndex,
  };
}

/** Starts a fresh Cascade sequence on a tier-1 board. */
export function startCascade(s: State, fx: FlowEffects): RefractState {
  const next = {
    ...copyState(s),
    mode: "cascade" as const,
    solvedCount: 0,
    tier: 1,
  };
  return playBoard(next, generateBoard(1, fx.random));
}

/** Generates the next Cascade board at the state's tier. */
export function nextCascadeBoard(s: State, fx: FlowEffects): RefractState {
  const tier = Math.min(MAX_TIER, Math.max(1, Math.floor(s.tier)));
  return playBoard(
    s,
    generateBoard(Number.isFinite(tier) ? tier : 1, fx.random),
  );
}

/** The frame a board becomes solved: the trace ends, progress is recorded, and the screen moves on. */
export function onSolved(s: State, fx: Effects): RefractState {
  fx.cues.add(CUES.solved);
  if (s.mode === "cascade") {
    const solvedCount = s.solvedCount + 1;
    return { ...goTo(s, "solved"), solvedCount, tier: tierFor(solvedCount) };
  }
  const index = s.boardIndex;
  const solvedBoards = s.solvedBoards.includes(index)
    ? [...s.solvedBoards]
    : [...s.solvedBoards, index].sort((a, b) => a - b);
  const unlockedCount = Math.max(
    s.unlockedCount,
    Math.min(CAMPAIGN_LENGTH, index + 2),
  );
  const allSolved = Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => i).every(
    (i) => solvedBoards.includes(i),
  );
  return {
    ...goTo(s, allSolved ? "complete" : "solved"),
    solvedBoards,
    unlockedCount,
    selectIndex: index,
  };
}

/** The `clear` action's transaction: every beam emptied, any trace ended. */
export function clearBeams(s: State, fx: Effects): RefractState {
  if (hasSegments(s.beams)) fx.cues.add(CUES.clear);
  return { ...copyState(s), beams: emptyBeams(s.board), tracing: null };
}

/** Whether campaign board `index` may be entered. */
export function isUnlocked(s: State, index: number): boolean {
  return (
    index >= 0 &&
    index < CAMPAIGN_LENGTH &&
    (index < s.unlockedCount || s.solvedBoards.includes(index))
  );
}

/** `confirm` on the current screen. */
export function confirm(s: State, fx: FlowEffects): RefractState {
  switch (s.screen) {
    case "title":
      if (s.menuIndex === 0)
        return toSelect({ ...copyState(s), mode: "campaign" });
      if (s.menuIndex === 1) return startCascade(s, fx);
      if (s.menuIndex === 2) return goTo(s, "howto");
      return copyState(s);
    case "select":
      return isUnlocked(s, s.selectIndex)
        ? enterCampaignBoard(s, s.selectIndex)
        : copyState(s);
    case "solved":
      return confirmSolved(s, fx);
    case "complete":
      if (s.menuIndex === 0) return toSelect(s);
      if (s.menuIndex === 1) return goTo(s, "title", 0);
      return copyState(s);
    default:
      return copyState(s);
  }
}

function confirmSolved(s: State, fx: FlowEffects): RefractState {
  if (s.mode === "cascade") {
    if (s.menuIndex === 0) return nextCascadeBoard(s, fx);
    if (s.menuIndex === 1) return startCascade(s, fx);
    return copyState(s);
  }
  const offersNext = s.boardIndex < CAMPAIGN_LENGTH - 1;
  const choice = offersNext ? s.menuIndex : s.menuIndex + 1;
  if (choice === 0) return enterCampaignBoard(s, s.boardIndex + 1);
  if (choice === 1) return enterCampaignBoard(s, s.boardIndex);
  if (choice === 2) return toSelect(s);
  return copyState(s);
}

/** `back` on the current screen. */
export function back(s: State): RefractState {
  switch (s.screen) {
    case "howto":
      return goTo(s, "title", TITLE_ITEMS.indexOf("HOW TO PLAY"));
    case "select":
      return goTo(s, "title", TITLE_ITEMS.indexOf("CAMPAIGN"));
    case "playing":
    case "solved":
      return s.mode === "cascade"
        ? goTo(s, "title", TITLE_ITEMS.indexOf("CASCADE"))
        : toSelect(s);
    case "complete":
      return toSelect(s);
    default:
      return copyState(s);
  }
}

/** `up`, `down`, `left`, or `right` on the current screen. */
export function navigate(s: State, dx: number, dy: number): RefractState {
  if (s.screen === "select") {
    const col = s.selectIndex % SET_SIZE;
    const row = Math.floor(s.selectIndex / SET_SIZE);
    const rowsCount = CAMPAIGN_LENGTH / SET_SIZE;
    const nextCol = (((col + dx) % SET_SIZE) + SET_SIZE) % SET_SIZE;
    const nextRow = (((row + dy) % rowsCount) + rowsCount) % rowsCount;
    return { ...copyState(s), selectIndex: nextRow * SET_SIZE + nextCol };
  }
  const count = menuItems(s).length;
  if (count === 0 || dy === 0) return copyState(s);
  return {
    ...copyState(s),
    menuIndex: (((s.menuIndex + dy) % count) + count) % count,
  };
}

/** Takes the target `id`, as the matching keyboard choice would. */
export function takeTarget(
  s: State,
  id: string,
  fx: FlowEffects,
): RefractState {
  if (id === "back") return back(s);
  if (id === "clear")
    return s.screen === "playing" ? clearBeams(s, fx) : copyState(s);
  if (id.startsWith("menu-")) {
    return confirm({ ...copyState(s), menuIndex: Number(id.slice(5)) }, fx);
  }
  if (id.startsWith("board-")) {
    return confirm(
      { ...copyState(s), selectIndex: Number(id.slice(6)) - 1 },
      fx,
    );
  }
  return copyState(s);
}

/** Moves the highlight onto the target under the pointer, if it is a menu item or a board. */
function highlight(s: RefractState, id: string | undefined): RefractState {
  if (id === undefined) return s;
  if (id.startsWith("menu-")) return { ...s, menuIndex: Number(id.slice(5)) };
  if (id.startsWith("board-"))
    return { ...s, selectIndex: Number(id.slice(6)) - 1 };
  return s;
}

/** A press of the primary pointer at `(x, y)`. */
export function pointerDown(
  s: State,
  x: number,
  y: number,
  device: PointerDevice,
  fx: FlowEffects,
): RefractState {
  // A press arriving with a trace still live first ends that trace.
  const settled =
    s.tracing === null ? copyState(s) : { ...copyState(s), ...releaseTrace(s) };
  const pressed: RefractState = {
    ...settled,
    pointer: { x, y, down: true, device },
  };
  const target = targetAt(pressed, x, y);
  if (target !== undefined) {
    return { ...highlight(pressed, target.id), armedTarget: target.id };
  }
  const disarmed = { ...pressed, armedTarget: null };
  if (pressed.screen !== "playing") return disarmed;
  const drawing = beginTrace(pressed.board, pressed.beams, x, y, fx);
  return settle({ ...disarmed, ...drawing }, fx);
}

/** The primary pointer moving to `(x, y)`. */
export function pointerMove(
  s: State,
  x: number,
  y: number,
  device: PointerDevice,
  fx: FlowEffects,
): RefractState {
  const moved: RefractState = {
    ...copyState(s),
    pointer: { x, y, down: s.pointer.down, device },
  };
  // Hovering highlights, and so does a held press that armed nothing and drew nothing.
  const pressedOnNothing = moved.armedTarget === null && moved.tracing === null;
  const hovered =
    !moved.pointer.down || pressedOnNothing
      ? highlight(moved, targetAt(moved, x, y)?.id)
      : moved;
  return continueTrace(hovered, x, y, fx);
}

function continueTrace(
  s: RefractState,
  x: number,
  y: number,
  fx: FlowEffects,
): RefractState {
  if (s.screen !== "playing" || s.tracing === null) return s;
  const drawing = moveTrace(s.board, s, x, y, fx);
  return settle({ ...s, ...drawing }, fx);
}

/** The release of the primary pointer, wherever it last was. */
export function pointerUp(
  s: State,
  device: PointerDevice,
  fx: FlowEffects,
): RefractState {
  const released: RefractState = {
    ...copyState(s),
    pointer: { ...s.pointer, down: false, device },
  };
  const armed = released.armedTarget;
  const ended: RefractState =
    released.tracing === null
      ? { ...released, armedTarget: null }
      : { ...released, ...releaseTrace(released), armedTarget: null };
  if (armed === null) return ended;
  const target = targetAt(ended, ended.pointer.x, ended.pointer.y);
  if (target === undefined || target.id !== armed) return ended;
  return takeTarget(ended, armed, fx);
}

/** After a change to the beams: a board that now satisfies R9 ends play. */
function settle(s: RefractState, fx: Effects): RefractState {
  if (
    s.screen === "playing" &&
    s.board.nodes.length > 0 &&
    isSolved(s.board, s.beams)
  ) {
    return onSolved(s, fx);
  }
  return s;
}
