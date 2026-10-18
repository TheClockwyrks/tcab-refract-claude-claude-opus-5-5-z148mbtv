// The debug and automation surface (specs/instrumentation.md). Every pose is a
// transition over the state, built on the same functions play runs through,
// so a scenario driven from here behaves exactly as one played by hand.

import type { DeepReadonly } from "ts-essentials";
import { MAX_TIER, REFRACT_DEBUG_VERSION } from "./constants";
import { cellX, cellY, parseBoard } from "./board";
import type {
  Mode,
  PointerDevice,
  RefractDebugApi,
  RefractSnapshot,
  RefractState,
  Screen,
} from "./game";
import {
  clearBeams,
  copyState,
  initialState,
  playBoard,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./flow";
import type { FlowEffects } from "./flow";
import { generateBoard } from "./generator";
import { beamOf, isBeamComplete, isSolved, spentAt } from "./rules";
import { targetsFor } from "./targets";

type State = DeepReadonly<RefractState>;

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "select",
  "playing",
  "solved",
  "complete",
];
const MODES: readonly Mode[] = ["campaign", "cascade"];
const DEVICES: readonly PointerDevice[] = ["mouse", "pen", "touch"];

/** Effects for a pose: the surface plays no sound, so raised cues go nowhere. */
function poseEffects(): FlowEffects {
  return { cues: new Set(), random: Math.random };
}

function checkDevice(device: PointerDevice): PointerDevice {
  if (!DEVICES.includes(device)) {
    throw new Error(`Refract: "${String(device)}" is not a pointer device`);
  }
  return device;
}

function checkPosition(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error(`Refract: (${x}, ${y}) is not a stage position`);
  }
}

/** A pure reading of the state, in the shape specs/instrumentation.md fixes. */
export function snapshot(s: State): RefractSnapshot {
  const board = s.board;
  const beams: RefractSnapshot["beams"] = {};
  for (const beam of s.beams) {
    beams[beam.channel] = {
      cells: beam.cells.map((c) => ({ col: c.col, row: c.row })),
      complete: isBeamComplete(board, beam),
    };
  }
  let tracing: RefractSnapshot["tracing"] = null;
  if (s.tracing !== null) {
    const cells = beamOf(s.beams, s.tracing.channel).cells;
    // A live trace always holds at least the cell its press placed.
    const live = cells[cells.length - 1] ?? { col: -1, row: -1 };
    tracing = {
      channel: s.tracing.channel,
      live: { col: live.col, row: live.row },
    };
  }
  return {
    version: REFRACT_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    boardIndex: s.boardIndex,
    solvedBoards: [...s.solvedBoards],
    unlockedCount: s.unlockedCount,
    selectIndex: s.selectIndex,
    solvedCount: s.solvedCount,
    tier: s.tier,
    board: {
      cols: board.cols,
      rows: board.rows,
      nodes: board.nodes.map((n) => ({
        col: n.col,
        row: n.row,
        x: cellX(n.col, board.cols),
        y: cellY(n.row, board.rows),
        kind: n.kind,
        channel: n.channel,
        charges: n.charges,
        spent: n.kind === "crystal" ? spentAt(s.beams, n) : null,
      })),
    },
    beams,
    solved: board.nodes.length > 0 && isSolved(board, s.beams),
    tracing,
    pointer: { ...s.pointer },
    targets: targetsFor(s).map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      w: t.w,
      h: t.h,
    })),
    muted: s.muted,
    simTime: s.simTime,
  };
}

/** Builds the surface `initialize` returns beside the state. */
export function createDebugApi(): RefractDebugApi {
  return {
    version: REFRACT_DEBUG_VERSION,

    reset: (s) => ({
      ...initialState(s.muted),
      pointer: {
        x: s.pointer.x,
        y: s.pointer.y,
        down: false,
        device: s.pointer.device,
      },
    }),

    snapshot,

    // Every reported reading is worked out at the read, so there is nothing to bring into line.
    reconcile: (s) => copyState(s),

    setMode: (s, mode) => {
      if (!MODES.includes(mode))
        throw new Error(`Refract: "${String(mode)}" is not a mode`);
      return { ...copyState(s), mode };
    },

    setScreen: (s, screen) => {
      if (!SCREENS.includes(screen)) {
        throw new Error(`Refract: "${String(screen)}" is not a screen`);
      }
      return { ...copyState(s), screen, armedTarget: null };
    },

    setMenuIndex: (s, index) => ({ ...copyState(s), menuIndex: index }),

    setSolvedCount: (s, count) => ({ ...copyState(s), solvedCount: count }),

    setTier: (s, tier) => ({ ...copyState(s), tier }),

    generateBoard: (s, tier) => {
      if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER) {
        throw new RangeError(
          `Refract: tier ${tier} is not on the ladder 1..${MAX_TIER}`,
        );
      }
      return playBoard(s, generateBoard(tier, Math.random));
    },

    loadBoard: (s, board) => playBoard(s, parseBoard(board)),

    pointerDown: (s, x, y, device = "mouse") => {
      checkPosition(x, y);
      return pointerDown(s, x, y, checkDevice(device), poseEffects());
    },

    pointerMove: (s, x, y, device = "mouse") => {
      checkPosition(x, y);
      return pointerMove(s, x, y, checkDevice(device), poseEffects());
    },

    pointerUp: (s, device = "mouse") =>
      pointerUp(s, checkDevice(device), poseEffects()),

    clear: (s) => clearBeams(s, poseEffects()),
  };
}
