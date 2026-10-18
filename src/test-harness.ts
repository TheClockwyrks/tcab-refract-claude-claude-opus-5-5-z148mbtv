// A test bench: the real engine over an in-process canvas and a constant clock,
// with a surface whose events the tests dispatch keys and pointers through.
// Used by the unit tests alone; the shipped build never imports it.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine, SurfaceMetrics } from "@clockwyrks/simple-2d";
import { LAYOUT, STAGE_H, STAGE_W } from "./constants";
import { BACKGROUND, game } from "./game";
import type { RefractDebugApi, RefractState } from "./game";

export interface Bench {
  readonly engine: Engine<RefractState, RefractDebugApi>;
  readonly debug: RefractDebugApi;
  /** Every cue played, in order. */
  readonly cues: string[];
  key(code: string): Promise<void>;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    extra?: { pointerType?: string; pointerId?: number; isPrimary?: boolean },
  ): void;
  /** The engine's snapshot through the debug surface. */
  snap(): ReturnType<RefractDebugApi["snapshot"]>;
  pose(
    transition: (s: Parameters<RefractDebugApi["snapshot"]>[0]) => RefractState,
  ): void;
}

export async function startBench(): Promise<Bench> {
  const canvas = createCanvas(STAGE_W, STAGE_H) as unknown as HTMLCanvasElement;
  const events = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => STAGE_W,
    cssHeight: () => STAGE_H,
    dpr: () => 1,
    events: () => events,
  };
  const engine = createEngine({
    canvas,
    width: STAGE_W,
    height: STAGE_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(1000 / 60),
    surface,
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  await engine.initialize();
  const debug = engine.debug;
  return {
    engine,
    debug,
    cues,
    async key(code) {
      events.dispatchEvent(
        Object.assign(new Event("keydown"), { code, repeat: false }),
      );
      await engine.advance(1);
      events.dispatchEvent(
        Object.assign(new Event("keyup"), { code, repeat: false }),
      );
      await engine.advance(1);
    },
    pointer(type, x, y, extra = {}) {
      const down = type !== "pointerup";
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: extra.pointerId ?? 1,
          pointerType: extra.pointerType ?? "mouse",
          isPrimary: extra.isPrimary ?? true,
          button: type === "pointermove" ? -1 : 0,
          buttons: down ? 1 : 0,
        }),
      );
    },
    snap: () => debug.snapshot(engine.state),
    pose: (transition) => {
      engine.apply(transition);
    },
  };
}
