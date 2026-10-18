// Refract — the game: the state it holds, the debug surface that poses and reads
// that state, and the three functions the engine drives.
//
// The state declarations below are specs/state.md's, verbatim in shape. The
// work is split across the modules beside this one: `board.ts` (geometry and
// notation), `rules.ts` (the limits and completion conditions), `trace.ts` (the
// pointer drawing a beam), `flow.ts` (the screen machine and the menus),
// `step.ts` (one frame of input), `targets.ts` (the pointer targets),
// `generator.ts` and `solver.ts` (Cascade's boards), `render.ts` and `draw.ts`
// (the look), and `debug.ts` (the automation surface).

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS } from "./constants";
import { CUE_SPECS } from "./audio";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { initialState } from "./flow";
import { renderGame } from "./render";
import { step } from "./step";

export type Screen =
  "title" | "howto" | "select" | "playing" | "solved" | "complete";

export type Mode = "campaign" | "cascade";

export type Channel = "triangle" | "square" | "diamond";

export type NodeKind = "emitter" | "lens" | "crystal";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface NodeState {
  readonly col: number;
  readonly row: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
}

export interface BoardState {
  readonly cols: number;
  readonly rows: number;
  readonly nodes: readonly NodeState[];
}

export interface BeamState {
  readonly channel: Channel;
  readonly cells: readonly Cell[];
}

export interface TraceState {
  readonly channel: Channel;
}

export type PointerDevice = "mouse" | "pen" | "touch";

export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
  readonly device: PointerDevice;
}

export interface RefractState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;

  readonly board: BoardState;
  readonly beams: readonly BeamState[];
  readonly tracing: TraceState | null;

  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;

  readonly solvedCount: number;
  readonly tier: number;

  readonly pointer: PointerState;
  readonly armedTarget: string | null;
  readonly simTime: number;
  readonly muted: boolean;
}

/** One node as the snapshot reports it, with its derived center and spent count. */
export interface SnapshotNode {
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly kind: NodeKind;
  readonly channel: Channel | null;
  readonly charges: number | null;
  readonly spent: number | null;
}

/** What `snapshot` returns (specs/instrumentation.md, Snapshot shape). */
export interface RefractSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly boardIndex: number;
  readonly solvedBoards: readonly number[];
  readonly unlockedCount: number;
  readonly selectIndex: number;
  readonly solvedCount: number;
  readonly tier: number;
  readonly board: {
    readonly cols: number;
    readonly rows: number;
    readonly nodes: readonly SnapshotNode[];
  };
  readonly beams: {
    [channel in Channel]?: {
      readonly cells: readonly Cell[];
      readonly complete: boolean;
    };
  };
  readonly solved: boolean;
  readonly tracing: { readonly channel: Channel; readonly live: Cell } | null;
  readonly pointer: PointerState;
  readonly targets: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
  readonly muted: boolean;
  readonly simTime: number;
}

type View = DeepReadonly<RefractState>;

/**
 * The debug and automation surface (specs/instrumentation.md). Every pose takes
 * the current state and returns the next; `snapshot` reads one.
 */
export interface RefractDebugApi {
  readonly version: number;
  reset(state: View): RefractState;
  snapshot(state: View): RefractSnapshot;
  reconcile(state: View): RefractState;
  setMode(state: View, mode: Mode): RefractState;
  setScreen(state: View, screen: Screen): RefractState;
  setMenuIndex(state: View, index: number): RefractState;
  setSolvedCount(state: View, count: number): RefractState;
  setTier(state: View, tier: number): RefractState;
  generateBoard(state: View, tier: number): RefractState;
  loadBoard(state: View, board: readonly string[]): RefractState;
  pointerDown(
    state: View,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerMove(
    state: View,
    x: number,
    y: number,
    device?: PointerDevice,
  ): RefractState;
  pointerUp(state: View, device?: PointerDevice): RefractState;
  clear(state: View): RefractState;
}

/**
 * The stage background, a CSS color string: the dark of the optical bench, which
 * the letterbox bars carry as well.
 */
export const BACKGROUND = "#070a12";

/** The game this build's engine drives. */
export const game: Game<RefractState, RefractDebugApi> = {
  initialize(api: InitApi<RefractState>): [RefractState, RefractDebugApi] {
    for (const action of ACTIONS) {
      api.input.register(action, { keys: [...BINDINGS[action]] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS))
      api.audio.define(cue, spec);
    registerDiagnostics(api);
    return [initialState(), createDebugApi()];
  },

  update(state: View, api: UpdateApi, dt: number): RefractState {
    return step(state, api, dt);
  },

  render(state: View, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
