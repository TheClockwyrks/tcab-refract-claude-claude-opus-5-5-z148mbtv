import { describe, expect, it } from "vitest";
import { MAX_TIER } from "./constants";
import { cellX, cellY } from "./board";
import type { RefractState } from "./game";
import { startBench } from "./test-harness";

/** Every declared field but the ones a pose names, for "sets its own field alone". */
function others(
  state: RefractState,
  ...fields: (keyof RefractState)[]
): Partial<RefractState> {
  const copy: Partial<RefractState> = { ...state };
  for (const f of fields) delete copy[f];
  return copy;
}

describe("the field poses", () => {
  it("each set their own field alone", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["TtT"]));
    b.pose((s) => b.debug.pointerDown(s, cellX(0, 3), cellY(0, 1)));
    const base = b.engine.state as RefractState;
    const cases: [
      keyof RefractState,
      (s: RefractState) => RefractState,
      unknown,
    ][] = [
      ["mode", (s) => b.debug.setMode(s, "cascade"), "cascade"],
      ["menuIndex", (s) => b.debug.setMenuIndex(s, 2), 2],
      ["solvedCount", (s) => b.debug.setSolvedCount(s, 17), 17],
      ["tier", (s) => b.debug.setTier(s, 4), 4],
    ];
    for (const [field, pose, value] of cases) {
      const next = pose(base);
      expect(next[field]).toEqual(value);
      expect(others(next, field)).toEqual(others(base, field));
    }
    const screened = b.debug.setScreen(base, "howto");
    expect(screened.screen).toBe("howto");
    expect(others(screened, "screen", "armedTarget")).toEqual(
      others(base, "screen", "armedTarget"),
    );
  });

  it("never clamps and refuses names it does not know", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setTier(s, MAX_TIER));
    expect(b.snap().tier).toBe(MAX_TIER);
    b.pose((s) => b.debug.setSolvedCount(s, 1000));
    expect(b.snap().solvedCount).toBe(1000);
    b.pose((s) => b.debug.setMenuIndex(s, 7));
    expect(b.snap().menuIndex).toBe(7);
    expect(() =>
      b.debug.setScreen(b.engine.state, "paused" as never),
    ).toThrow();
    expect(() => b.debug.setMode(b.engine.state, "arcade" as never)).toThrow();
    expect(() =>
      b.debug.pointerDown(b.engine.state, 1, 1, "stylus" as never),
    ).toThrow();
    expect(() => b.debug.pointerMove(b.engine.state, NaN, 1)).toThrow();
  });

  it("disarms the armed target when the screen is set", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.pointerDown(s, 640, 420));
    expect(b.engine.state.armedTarget).toBe("menu-0");
    b.pose((s) => b.debug.setScreen(s, "select"));
    expect(b.engine.state.armedTarget).toBeNull();
    b.pose((s) => b.debug.pointerUp(s));
    expect(b.snap().screen).toBe("select");
  });
});

describe("the board poses", () => {
  it("loads a board onto playing at its played position", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setMenuIndex(s, 2));
    b.pose((s) => b.debug.loadBoard(s, ["T.S", "1.s", "T.S"]));
    const snap = b.snap();
    expect(snap).toMatchObject({
      screen: "playing",
      tracing: null,
      solved: false,
      menuIndex: 0,
    });
    expect(snap.beams).toEqual({
      triangle: { cells: [], complete: false },
      square: { cells: [], complete: false },
    });
    expect(snap.board.nodes[0]).toEqual({
      col: 0,
      row: 0,
      x: 544,
      y: 296,
      kind: "emitter",
      channel: "triangle",
      charges: null,
      spent: null,
    });
    expect(snap.board.nodes[2]).toMatchObject({
      kind: "crystal",
      charges: 1,
      spent: 0,
    });
  });

  it("fails loudly on a board it cannot pose", async () => {
    const b = await startBench();
    expect(() => b.debug.loadBoard(b.engine.state, ["T.Q"])).toThrow();
    expect(() => b.debug.loadBoard(b.engine.state, ["TttttttT"])).toThrow();
    expect(() =>
      b.debug.loadBoard(b.engine.state, Array(7).fill("t")),
    ).toThrow();
    expect(b.snap().screen).toBe("title");
  });

  it("generates a board at a tier and leaves the run alone", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setSolvedCount(s, 3));
    b.pose((s) => b.debug.generateBoard(s, 5));
    const snap = b.snap();
    expect(snap).toMatchObject({
      screen: "playing",
      mode: "campaign",
      solvedCount: 3,
      tier: 1,
    });
    expect(snap.board.cols).toBeGreaterThanOrEqual(6);
    expect(Object.keys(snap.beams)).toEqual(["triangle", "square", "diamond"]);
    expect(() => b.debug.generateBoard(b.engine.state, 6)).toThrow(RangeError);
  });

  it("clears the beams from wherever the game stands", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["TtT"]));
    b.pose((s) => b.debug.pointerDown(s, cellX(0, 3), cellY(0, 1)));
    b.pose((s) => b.debug.pointerMove(s, cellX(1, 3), cellY(0, 1)));
    b.pose((s) => b.debug.setScreen(s, "complete"));
    b.pose((s) => b.debug.clear(s));
    expect(b.snap()).toMatchObject({ screen: "complete", tracing: null });
    expect(b.snap().beams.triangle?.cells).toEqual([]);
  });
});

describe("the readings", () => {
  it("snapshot reads without changing anything", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["T2T", "S.S"]));
    const before = b.engine.state;
    const snap = b.debug.snapshot(before);
    expect(b.engine.state).toBe(before);
    expect(snap.targets.map((t) => t.id)).toEqual(["clear", "back"]);
    expect(snap.board.nodes.find((n) => n.kind === "crystal")?.spent).toBe(0);
  });

  it("reconcile is a no-op, idempotent, and never an error", async () => {
    const b = await startBench();
    for (const screen of [
      "title",
      "howto",
      "select",
      "playing",
      "solved",
      "complete",
    ] as const) {
      b.pose((s) => b.debug.setScreen(s, screen));
      const before = b.debug.snapshot(b.engine.state);
      b.pose((s) => b.debug.reconcile(s));
      const once = b.engine.state;
      b.pose((s) => b.debug.reconcile(s));
      expect(b.engine.state).toEqual(once);
      expect(b.debug.snapshot(b.engine.state)).toEqual(before);
    }
  });

  it("reset returns every declared field to the title, leaving mute alone", async () => {
    const b = await startBench();
    await b.key("KeyM");
    b.pose((s) => b.debug.loadBoard(s, ["TtT"]));
    b.pose((s) => b.debug.pointerDown(s, cellX(0, 3), cellY(0, 1)));
    b.pose(
      (s) =>
        ({
          ...b.debug.setSolvedCount(s, 9),
          solvedBoards: [0, 1],
          unlockedCount: 3,
        }) as RefractState,
    );
    await b.engine.advance(5);
    b.pose((s) => b.debug.reset(s));
    expect(b.snap()).toMatchObject({
      screen: "title",
      mode: "campaign",
      menuIndex: 0,
      board: { cols: 0, rows: 0, nodes: [] },
      beams: {},
      tracing: null,
      boardIndex: 0,
      solvedBoards: [],
      unlockedCount: 1,
      selectIndex: 0,
      solvedCount: 0,
      tier: 1,
      pointer: { down: false },
      simTime: 0,
      muted: true,
    });
    expect(b.engine.state.armedTarget).toBeNull();
  });

  it("takes a target from a posed press and release", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setScreen(s, "howto"));
    b.pose((s) => b.debug.pointerDown(s, 100, 60, "touch"));
    b.pose((s) => b.debug.pointerUp(s, "touch"));
    expect(b.snap()).toMatchObject({
      screen: "title",
      menuIndex: 2,
      pointer: { device: "touch" },
    });
  });
});
