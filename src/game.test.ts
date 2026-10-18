import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_LENGTH,
  STAGE_H,
  STAGE_W,
  TARGET_MIN_H,
  TARGET_MIN_W,
} from "./constants";
import { boardExtent, cellX, cellY, parseBoard } from "./board";
import { CAMPAIGN_BOARDS } from "./campaign-boards";
import type { BoardState, RefractSnapshot, RefractState } from "./game";
import { solveBoard } from "./solver";
import { startBench } from "./test-harness";
import type { Bench } from "./test-harness";

type Snap = RefractSnapshot;

const center = (snap: Snap, id: string): [number, number] => {
  const t = snap.targets.find((target) => target.id === id);
  if (t === undefined) throw new Error(`no target ${id}`);
  return [t.x + t.w / 2, t.y + t.h / 2];
};

const at = (
  board: { cols: number; rows: number },
  col: number,
  row: number,
): [number, number] => [cellX(col, board.cols), cellY(row, board.rows)];

/** Draws a whole solution through the debug surface's pointer operations. */
function drawSolution(b: Bench, board: BoardState): void {
  const solution = solveBoard(board);
  if (solution === null) throw new Error("unsolvable");
  for (const beam of solution) {
    const [first, ...rest] = beam.cells;
    b.pose((s) => b.debug.pointerDown(s, ...at(board, first.col, first.row)));
    for (const cell of rest)
      b.pose((s) => b.debug.pointerMove(s, ...at(board, cell.col, cell.row)));
    b.pose((s) => b.debug.pointerUp(s));
  }
}

/** Clicks a target with real pointer events through the engine. */
async function click(
  b: Bench,
  id: string,
  pointerType = "mouse",
): Promise<void> {
  const [x, y] = center(b.snap(), id);
  b.pointer("pointerdown", x, y, { pointerType });
  await b.engine.advance(1);
  b.pointer("pointerup", x, y, { pointerType });
  await b.engine.advance(1);
}

function targetsAreSound(snap: Snap, board?: Snap["board"]): void {
  for (const t of snap.targets) {
    expect(t.w).toBeGreaterThanOrEqual(TARGET_MIN_W);
    expect(t.h).toBeGreaterThanOrEqual(TARGET_MIN_H);
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.x + t.w).toBeLessThanOrEqual(STAGE_W);
    expect(t.y + t.h).toBeLessThanOrEqual(STAGE_H);
  }
  snap.targets.forEach((a, i) =>
    snap.targets.slice(i + 1).forEach((c) => {
      const apart =
        a.x + a.w <= c.x ||
        c.x + c.w <= a.x ||
        a.y + a.h <= c.y ||
        c.y + c.h <= a.y;
      expect(apart).toBe(true);
    }),
  );
  if (board !== undefined && board.nodes.length > 0) {
    const e = boardExtent(board);
    for (const t of snap.targets) {
      const apart =
        t.x + t.w <= e.x ||
        e.x + e.w <= t.x ||
        t.y + t.h <= e.y ||
        e.y + e.h <= t.y;
      expect(apart).toBe(true);
    }
  }
}

describe("a fresh session", () => {
  it("opens on the title with every field at rest", async () => {
    const b = await startBench();
    const snap = b.snap();
    expect(snap).toMatchObject({
      version: 2,
      screen: "title",
      mode: "campaign",
      menuIndex: 0,
      boardIndex: 0,
      solvedBoards: [],
      unlockedCount: 1,
      selectIndex: 0,
      solvedCount: 0,
      tier: 1,
      board: { cols: 0, rows: 0, nodes: [] },
      beams: {},
      solved: false,
      tracing: null,
      pointer: { x: 0, y: 0, down: false, device: "mouse" },
      muted: false,
      simTime: 0,
    });
    expect(snap.targets.map((t) => t.id)).toEqual([
      "menu-0",
      "menu-1",
      "menu-2",
    ]);
  });

  it("accumulates simulation time on every screen", async () => {
    const b = await startBench();
    await b.engine.advance(60);
    expect(b.snap().simTime).toBeCloseTo(1, 6);
    b.pose((s) => b.debug.setScreen(s, "howto"));
    await b.engine.advance(30);
    expect(b.snap().simTime).toBeCloseTo(1.5, 6);
  });

  it("registers the diagnostics the overlay shows", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["T2T", "S.S"]));
    const names = b.engine.diagnostics().map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "screen",
        "mode",
        "board",
        "beam triangle",
        "crystals",
        "solved",
        "pointer",
      ]),
    );
    const read = Object.fromEntries(
      b.engine.diagnostics().map((d) => [d.name, d.value]),
    );
    expect(read.board).toBe("3x2");
    expect(read["beam triangle"]).toBe("0 seg, open");
    expect(read["beam diamond"]).toBe("-");
    expect(read.crystals).toBe("(1,0) 0/2");
    expect(read.solved).toBe(false);
  });
});

describe("the title menu", () => {
  it("wraps the highlight and ignores back", async () => {
    const b = await startBench();
    await b.key("ArrowUp");
    expect(b.snap().menuIndex).toBe(2);
    await b.key("KeyS");
    expect(b.snap().menuIndex).toBe(0);
    await b.key("Escape");
    expect(b.snap().screen).toBe("title");
  });

  it("opens How to play and returns with it highlighted", async () => {
    const b = await startBench();
    await b.key("ArrowDown");
    await b.key("ArrowDown");
    await b.key("Enter");
    expect(b.snap()).toMatchObject({ screen: "howto", menuIndex: 0 });
    expect(b.snap().targets.map((t) => t.id)).toEqual(["back"]);
    await click(b, "back");
    expect(b.snap()).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("highlights on hover and takes a press released inside the same item", async () => {
    const b = await startBench();
    const [x, y] = center(b.snap(), "menu-2");
    b.pointer("pointermove", x, y);
    await b.engine.advance(1);
    expect(b.snap().menuIndex).toBe(2);
    // Released elsewhere: nothing is taken and the target is disarmed.
    const [x1, y1] = center(b.snap(), "menu-1");
    b.pointer("pointerdown", x1, y1, { pointerType: "touch" });
    await b.engine.advance(1);
    expect(b.snap().menuIndex).toBe(1);
    expect(b.engine.state.armedTarget).toBe("menu-1");
    b.pointer("pointermove", 20, 700, { pointerType: "touch" });
    b.pointer("pointerup", 20, 700, { pointerType: "touch" });
    await b.engine.advance(1);
    expect(b.snap().screen).toBe("title");
    expect(b.engine.state.armedTarget).toBeNull();
    expect(b.snap().pointer.device).toBe("touch");
    await click(b, "menu-0", "pen");
    expect(b.snap()).toMatchObject({ screen: "select", mode: "campaign" });
  });
});

describe("the campaign", () => {
  it("unlocks one board at a time and records solves", async () => {
    const b = await startBench();
    await b.key("Enter");
    expect(b.snap()).toMatchObject({ screen: "select", selectIndex: 0 });
    targetsAreSound(b.snap());
    expect(b.snap().targets.map((t) => t.id)).toEqual([
      ...Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => `board-${i + 1}`),
      "back",
    ]);
    // A locked board does nothing.
    await b.key("ArrowRight");
    expect(b.snap().selectIndex).toBe(1);
    await b.key("Enter");
    expect(b.snap().screen).toBe("select");
    // Board 1 opens.
    await click(b, "board-1");
    expect(b.snap()).toMatchObject({
      screen: "playing",
      boardIndex: 0,
      menuIndex: 0,
    });
    expect(b.snap().board.cols).toBe(3);
    targetsAreSound(b.snap(), b.snap().board);
    expect(b.snap().targets.map((t) => t.id)).toEqual(["clear", "back"]);
    drawSolution(b, parseBoard(CAMPAIGN_BOARDS[0]));
    const snap = b.snap();
    expect(snap).toMatchObject({
      screen: "solved",
      solvedBoards: [0],
      unlockedCount: 2,
      menuIndex: 0,
      tracing: null,
      solved: true,
    });
    expect(snap.targets.map((t) => t.id)).toEqual([
      "menu-0",
      "menu-1",
      "menu-2",
    ]);
    targetsAreSound(snap);
    // Next board.
    await b.key("Enter");
    expect(b.snap()).toMatchObject({
      screen: "playing",
      boardIndex: 1,
      selectIndex: 1,
    });
    expect(b.snap().beams.triangle?.cells).toEqual([]);
    // Back to the grid, with the highlight on the board last entered.
    await b.key("Escape");
    expect(b.snap()).toMatchObject({ screen: "select", selectIndex: 1 });
    await b.key("Escape");
    expect(b.snap()).toMatchObject({ screen: "title", menuIndex: 0 });
    // Cascade leaves campaign progress alone.
    await b.key("ArrowDown");
    await b.key("Enter");
    expect(b.snap()).toMatchObject({
      mode: "cascade",
      solvedBoards: [0],
      unlockedCount: 2,
    });
    await b.key("Escape");
    expect(b.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
    await b.key("ArrowUp");
    await b.key("Enter");
    expect(b.snap()).toMatchObject({
      screen: "select",
      solvedBoards: [0],
      unlockedCount: 2,
    });
  });

  it("offers replay and the grid, and no next board after board 24", async () => {
    const b = await startBench();
    b.pose((s) => ({
      ...b.debug.setScreen(s, "select"),
      unlockedCount: 24,
      boardIndex: 23,
      selectIndex: 23,
    }));
    await b.key("Enter");
    expect(b.snap()).toMatchObject({ screen: "playing", boardIndex: 23 });
    drawSolution(b, parseBoard(CAMPAIGN_BOARDS[23]));
    expect(b.snap().screen).toBe("solved");
    expect(b.snap().targets.map((t) => t.id)).toEqual(["menu-0", "menu-1"]);
    await b.key("ArrowDown");
    await b.key("ArrowDown");
    expect(b.snap().menuIndex).toBe(0);
    await click(b, "menu-0");
    expect(b.snap()).toMatchObject({ screen: "playing", boardIndex: 23 });
    drawSolution(b, parseBoard(CAMPAIGN_BOARDS[23]));
    await click(b, "menu-1");
    expect(b.snap()).toMatchObject({ screen: "select", selectIndex: 23 });
  });

  it("moves the select highlight within rows and between sets, wrapping", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setScreen(s, "select"));
    await b.key("ArrowLeft");
    expect(b.snap().selectIndex).toBe(5);
    await b.key("ArrowUp");
    expect(b.snap().selectIndex).toBe(23);
    await b.key("ArrowDown");
    expect(b.snap().selectIndex).toBe(5);
    await b.key("ArrowRight");
    expect(b.snap().selectIndex).toBe(0);
    const [x, y] = center(b.snap(), "board-9");
    b.pointer("pointermove", x, y);
    await b.engine.advance(1);
    expect(b.snap().selectIndex).toBe(8);
  });

  it("ends on the complete screen when the last board falls", async () => {
    const b = await startBench();
    const others = Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => i).filter(
      (i) => i !== 4,
    );
    b.pose(
      (s) =>
        ({
          ...s,
          solvedBoards: others,
          unlockedCount: CAMPAIGN_LENGTH,
        }) as RefractState,
    );
    b.pose((s) => b.debug.setScreen(s, "select"));
    await click(b, "board-5");
    drawSolution(b, parseBoard(CAMPAIGN_BOARDS[4]));
    expect(b.snap()).toMatchObject({ screen: "complete", menuIndex: 0 });
    expect(b.snap().solvedBoards).toHaveLength(CAMPAIGN_LENGTH);
    targetsAreSound(b.snap());
    await b.key("ArrowUp");
    expect(b.snap().menuIndex).toBe(1);
    await b.key("Enter");
    expect(b.snap()).toMatchObject({ screen: "title", menuIndex: 0 });
    b.pose((s) => b.debug.setScreen(s, "complete"));
    await b.key("Escape");
    expect(b.snap().screen).toBe("select");
    b.pose((s) => b.debug.setScreen(s, "complete"));
    await click(b, "menu-0");
    expect(b.snap().screen).toBe("select");
  });

  it("keeps every playing target clear of every campaign board", async () => {
    const b = await startBench();
    for (const lines of CAMPAIGN_BOARDS) {
      b.pose((s) => b.debug.loadBoard(s, lines));
      targetsAreSound(b.snap(), b.snap().board);
    }
    b.pose((s) =>
      b.debug.loadBoard(s, [
        "t......",
        "t......",
        "t......",
        "t......",
        "t......",
        "T.....T",
      ]),
    );
    targetsAreSound(b.snap(), b.snap().board);
  });
});

describe("cascade", () => {
  it("runs a sequence of generated boards up the ladder", async () => {
    const b = await startBench();
    await b.key("ArrowDown");
    await b.key("Enter");
    expect(b.snap()).toMatchObject({
      screen: "playing",
      mode: "cascade",
      solvedCount: 0,
      tier: 1,
    });
    await b.key("Enter");
    expect(b.snap().screen).toBe("playing");
    drawSolution(b, b.engine.state.board as BoardState);
    expect(b.snap()).toMatchObject({
      screen: "solved",
      solvedCount: 1,
      tier: 1,
      menuIndex: 0,
    });
    expect(b.snap().targets.map((t) => t.id)).toEqual(["menu-0", "menu-1"]);
    targetsAreSound(b.snap());
    await click(b, "menu-0");
    expect(b.snap()).toMatchObject({ screen: "playing", solvedCount: 1 });
    // The fifth solve climbs to tier 2.
    b.pose((s) => b.debug.setSolvedCount(s, 4));
    drawSolution(b, b.engine.state.board as BoardState);
    expect(b.snap()).toMatchObject({
      screen: "solved",
      solvedCount: 5,
      tier: 2,
    });
    await b.key("Enter");
    expect(b.snap().board.nodes.some((n) => n.channel === "square")).toBe(true);
    drawSolution(b, b.engine.state.board as BoardState);
    // Restart drops back to tier 1.
    await b.key("ArrowDown");
    await b.key("Enter");
    expect(b.snap()).toMatchObject({
      screen: "playing",
      solvedCount: 0,
      tier: 1,
    });
    drawSolution(b, b.engine.state.board as BoardState);
    await b.key("Escape");
    expect(b.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("abandons the board with back and starts afresh from tier 1", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setMode(s, "cascade"));
    b.pose((s) => b.debug.setTier(s, 4));
    b.pose((s) => b.debug.generateBoard(s, 4));
    await click(b, "back");
    expect(b.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
    await b.key("Enter");
    expect(b.snap()).toMatchObject({
      screen: "playing",
      tier: 1,
      solvedCount: 0,
    });
  });
});

describe("tracing", () => {
  const lines = ["Tt2t", "t..T", "S2.S"];
  const board = parseBoard(lines);
  const p = (col: number, row: number): [number, number] => at(board, col, row);

  async function bench(): Promise<Bench> {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, lines));
    return b;
  }

  const cellsOf = (b: Bench, channel: "triangle" | "square") =>
    b.snap().beams[channel]?.cells.map((c) => [c.col, c.row]);

  it("starts at an emitter, extends, refuses, and retracts", async () => {
    const b = await bench();
    b.pose((s) => b.debug.pointerDown(s, ...p(0, 0)));
    expect(b.snap().tracing).toEqual({
      channel: "triangle",
      live: { col: 0, row: 0 },
    });
    expect(cellsOf(b, "triangle")).toEqual([[0, 0]]);
    b.pose((s) => b.debug.pointerMove(s, ...p(1, 0)));
    // A square node refuses the triangle beam, and the trace stays live.
    b.pose((s) => b.debug.pointerMove(s, ...p(0, 2)));
    expect(cellsOf(b, "triangle")).toEqual([
      [0, 0],
      [1, 0],
    ]);
    b.pose((s) => b.debug.pointerMove(s, ...p(2, 0)));
    expect(
      b.snap().board.nodes.find((n) => n.kind === "crystal" && n.row === 0)
        ?.spent,
    ).toBe(1);
    // Backing onto the node behind the live end retracts.
    b.pose((s) => b.debug.pointerMove(s, ...p(1, 0)));
    expect(cellsOf(b, "triangle")).toEqual([
      [0, 0],
      [1, 0],
    ]);
    b.pose((s) => b.debug.pointerMove(s, ...p(0, 0)));
    expect(cellsOf(b, "triangle")).toEqual([[0, 0]]);
    // A release at the starting node leaves no cells at all.
    b.pose((s) => b.debug.pointerUp(s));
    expect(cellsOf(b, "triangle")).toEqual([]);
    expect(b.snap().tracing).toBeNull();
  });

  it("resumes from either end and shortens from a node along the beam", async () => {
    const b = await bench();
    b.pose((s) => b.debug.pointerDown(s, ...p(0, 0)));
    for (const cell of [p(1, 0), p(0, 1), p(1, 2)] as const)
      b.pose((s) => b.debug.pointerMove(s, ...cell));
    b.pose((s) => b.debug.pointerUp(s));
    expect(cellsOf(b, "triangle")).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 2],
    ]);
    // Pressing the first cell reverses the beam so the live end is last.
    b.pose((s) => b.debug.pointerDown(s, ...p(0, 0)));
    expect(cellsOf(b, "triangle")).toEqual([
      [1, 2],
      [0, 1],
      [1, 0],
      [0, 0],
    ]);
    expect(b.snap().tracing?.live).toEqual({ col: 0, row: 0 });
    b.pose((s) => b.debug.pointerUp(s));
    // A node along the beam cuts it back to there.
    b.pose((s) => b.debug.pointerDown(s, ...p(0, 1)));
    expect(cellsOf(b, "triangle")).toEqual([
      [1, 2],
      [0, 1],
    ]);
    b.pose((s) => b.debug.pointerUp(s));
    // A press on nothing begins nothing but holds the pointer down.
    b.pose((s) => b.debug.pointerDown(s, 640, 680));
    expect(b.snap()).toMatchObject({ tracing: null, pointer: { down: true } });
    b.pose((s) => b.debug.pointerUp(s));
    // A press on a node no beam touches, not an emitter, begins nothing.
    b.pose((s) => b.debug.pointerDown(s, ...p(3, 0)));
    expect(b.snap().tracing).toBeNull();
  });

  it("begins nothing at a node two beams run through", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["T.S", ".2.", "S.T"]));
    const q = (col: number, row: number) => at({ cols: 3, rows: 3 }, col, row);
    for (const [from, mid, to] of [
      [q(0, 0), q(1, 1), q(2, 2)],
      [q(2, 0), q(1, 1), q(0, 2)],
    ]) {
      b.pose((s) => b.debug.pointerDown(s, ...from));
      b.pose((s) => b.debug.pointerMove(s, ...mid));
      b.pose((s) => b.debug.pointerMove(s, ...to));
      b.pose((s) => b.debug.pointerUp(s));
    }
    expect(b.snap().solved).toBe(true);
    b.pose((s) => b.debug.setScreen(s, "playing"));
    const before = b.snap().beams;
    b.pose((s) => b.debug.pointerDown(s, ...q(1, 1)));
    expect(b.snap().tracing).toBeNull();
    expect(b.snap().beams).toEqual(before);
  });

  it("plays each cue once per frame, through real pointer events", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["Ttt", "..T"]));
    const q = (col: number, row: number) => at({ cols: 3, rows: 2 }, col, row);
    b.pointer("pointerdown", ...q(0, 0));
    b.pointer("pointermove", ...q(1, 0));
    b.pointer("pointermove", 700, 600);
    b.pointer("pointermove", ...q(2, 0));
    await b.engine.advance(1);
    // Two segments in one frame, resolved in arrival order, sound once.
    expect(b.snap().beams.triangle?.cells).toHaveLength(3);
    expect(b.cues).toEqual(["connect"]);
    b.pointer("pointermove", ...q(1, 0));
    await b.engine.advance(1);
    expect(b.cues).toEqual(["connect", "retract"]);
    b.pointer("pointermove", ...q(2, 0));
    b.pointer("pointermove", ...q(2, 1));
    await b.engine.advance(1);
    expect(b.cues.slice(2)).toEqual(["connect", "channel-complete", "solved"]);
    b.pointer("pointerup", ...q(2, 1));
    await b.engine.advance(1);
    expect(b.snap().screen).toBe("solved");
  });

  it("ends the trace on the solving move, and the release changes nothing", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["TtT"]));
    const q = (col: number) => at({ cols: 3, rows: 1 }, col, 0);
    b.pointer("pointerdown", ...q(0));
    b.pointer("pointermove", ...q(1));
    b.pointer("pointermove", ...q(2));
    await b.engine.advance(1);
    expect(b.cues).toEqual(["connect", "channel-complete", "solved"]);
    expect(b.snap()).toMatchObject({
      screen: "solved",
      tracing: null,
      solved: true,
    });
    b.pointer("pointermove", ...q(1));
    b.pointer("pointerup", ...q(1));
    await b.engine.advance(1);
    expect(b.snap().beams.triangle?.cells).toHaveLength(3);
  });

  it("clears from the target and the key, on playing alone", async () => {
    const b = await bench();
    b.pose((s) => b.debug.pointerDown(s, ...p(0, 0)));
    b.pose((s) => b.debug.pointerMove(s, ...p(1, 0)));
    b.pose((s) => b.debug.pointerUp(s));
    await click(b, "clear");
    expect(cellsOf(b, "triangle")).toEqual([]);
    expect(b.cues).toContain("clear");
    b.pose((s) => b.debug.pointerDown(s, ...p(0, 0)));
    b.pose((s) => b.debug.pointerMove(s, ...p(1, 0)));
    b.pose((s) => b.debug.setScreen(s, "select"));
    await b.key("KeyR");
    expect(cellsOf(b, "triangle")).toHaveLength(2);
  });

  it("follows the primary pointer alone", async () => {
    const b = await bench();
    b.pointer("pointerdown", ...p(0, 0), {
      pointerType: "touch",
      pointerId: 3,
    });
    b.pointer("pointerdown", ...p(0, 2), {
      pointerType: "touch",
      pointerId: 4,
      isPrimary: false,
    });
    b.pointer("pointermove", ...p(1, 2), {
      pointerType: "touch",
      pointerId: 4,
      isPrimary: false,
    });
    await b.engine.advance(1);
    expect(b.snap().tracing?.channel).toBe("triangle");
    expect(cellsOf(b, "square")).toEqual([]);
  });
});

describe("mute", () => {
  it("toggles the engine's mute bit from any screen and mirrors it", async () => {
    const b = await startBench();
    await b.key("KeyM");
    expect(b.snap().muted).toBe(true);
    b.pose((s) => b.debug.reset(s));
    expect(b.snap().muted).toBe(true);
    await b.key("KeyM");
    expect(b.snap().muted).toBe(false);
  });
});
