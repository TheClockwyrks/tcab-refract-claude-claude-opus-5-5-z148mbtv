import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { boardExtent } from "./board";
import { CAMPAIGN_BOARDS } from "./campaign-boards";
import type { Box } from "./board";
import type { RefractState } from "./game";
import { startBench } from "./test-harness";
import type { Bench } from "./test-harness";

interface Painted {
  readonly text: string;
  readonly box: Box;
}

/** Records one frame and returns every piece of text it painted, with its box. */
async function paintedText(
  b: Bench,
): Promise<{ texts: Painted[]; ops: number }> {
  b.engine.startRecording();
  await b.engine.advance(1);
  const recording = b.engine.stopRecording();
  const frame = recording.frames[recording.frames.length - 1];
  const measure = createCanvas(10, 10).getContext("2d");
  let font = "10px sans-serif";
  let align = "left";
  let baseline = "alphabetic";
  const texts: Painted[] = [];
  for (const index of frame.ops) {
    const op = recording.ops[index];
    if (op.op === "set") {
      if (op.property === "font") font = String(op.value);
      if (op.property === "textAlign") align = String(op.value);
      if (op.property === "textBaseline") baseline = String(op.value);
      continue;
    }
    if (op.method !== "fillText") continue;
    const [value, x, y] = op.args as [string, number, number];
    measure.font = font;
    const w = measure.measureText(value).width;
    const size = Number(/(\d+)px/.exec(font)?.[1] ?? 10);
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const top = baseline === "middle" ? y - size / 2 : y - size;
    texts.push({ text: value, box: { x: left, y: top, w, h: size * 1.2 } });
  }
  return { texts, ops: frame.ops.length };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("rendering", () => {
  it("draws every screen", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, CAMPAIGN_BOARDS[17]));
    for (const mode of ["campaign", "cascade"] as const) {
      b.pose((s) => b.debug.setMode(s, mode));
      for (const screen of [
        "title",
        "howto",
        "select",
        "playing",
        "solved",
        "complete",
      ] as const) {
        b.pose((s) => b.debug.setScreen(s, screen));
        const { texts, ops } = await paintedText(b);
        expect(ops).toBeGreaterThan(20);
        expect(texts.length).toBeGreaterThan(0);
      }
    }
  });

  it("shows the title copy and the menu", async () => {
    const b = await startBench();
    const { texts } = await paintedText(b);
    const words = texts.map((t) => t.text);
    expect(words).toEqual(
      expect.arrayContaining([
        "REFRACT",
        "DRAW THE LIGHT",
        "CAMPAIGN",
        "CASCADE",
        "HOW TO PLAY",
      ]),
    );
  });

  it("keeps all text clear of the board on playing", async () => {
    const b = await startBench();
    const boards = [
      ...CAMPAIGN_BOARDS,
      ["t......", "t......", "t......", "t......", "t......", "T.....T"],
    ];
    for (const mode of ["campaign", "cascade"] as const) {
      b.pose((s) => b.debug.setMode(s, mode));
      for (const lines of boards) {
        b.pose((s) => b.debug.loadBoard(s, lines));
        const extent = boardExtent(b.engine.state.board);
        const { texts } = await paintedText(b);
        for (const t of texts)
          expect(overlaps(t.box, extent), t.text).toBe(false);
      }
    }
  });

  it("names the clear key beside the clear control and the cascade readouts beside their labels", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.setMode(s, "cascade"));
    b.pose((s) => b.debug.generateBoard(s, 2));
    b.pose(
      (s) => ({ ...b.debug.setSolvedCount(s, 7), tier: 2 }) as RefractState,
    );
    const { texts } = await paintedText(b);
    const find = (value: string) => texts.find((t) => t.text === value);
    expect(find("CLEAR")).toBeDefined();
    expect(find("R")).toBeDefined();
    for (const [label, value] of [
      ["SOLVED", "7"],
      ["TIER", "2"],
    ]) {
      const l = find(label);
      const v = texts.find(
        (t) =>
          t.text === value &&
          l !== undefined &&
          Math.abs(t.box.y - l.box.y) < 40,
      );
      expect(l).toBeDefined();
      expect(v).toBeDefined();
      if (l && v) expect(v.box.x - (l.box.x + l.box.w)).toBeLessThanOrEqual(96);
    }
  });

  it("draws a live trace and a hovered node", async () => {
    const b = await startBench();
    b.pose((s) => b.debug.loadBoard(s, ["Ttt", "..T"]));
    await b.key("KeyM");
    b.pointer("pointerdown", 544, 344);
    b.pointer("pointermove", 640, 344);
    b.pointer("pointermove", 700, 360);
    const { texts } = await paintedText(b);
    expect(b.snap().tracing?.channel).toBe("triangle");
    expect(texts.map((t) => t.text)).toContain("SOUND OFF  ·  M");
  });
});
