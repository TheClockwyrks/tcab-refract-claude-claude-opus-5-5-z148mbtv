// The five cues of specs/ui.md, synthesized by the engine's cue bus. Each is a
// short, distinct sound so the events are told apart by ear: a bright upward
// tick for a segment joined, a soft downward one for a segment taken back, a
// rising chime for a channel lit end to end, a long sweep for a solved board,
// and a low brush for a cleared bench.

import type { CueSpec } from "@clockwyrks/simple-2d";
import { CUES } from "./constants";
import type { CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.connect]: {
    wave: "sine",
    freq: 620,
    freqTo: 880,
    gain: 0.14,
    durationMs: 70,
  },
  [CUES.retract]: {
    wave: "triangle",
    freq: 420,
    freqTo: 260,
    gain: 0.12,
    durationMs: 80,
  },
  [CUES.channelComplete]: {
    wave: "triangle",
    freq: 523,
    freqTo: 1047,
    gain: 0.18,
    durationMs: 260,
  },
  [CUES.solved]: {
    wave: "sine",
    freq: 392,
    freqTo: 1568,
    gain: 0.22,
    durationMs: 700,
  },
  [CUES.clear]: {
    wave: "sawtooth",
    freq: 240,
    freqTo: 70,
    gain: 0.08,
    durationMs: 200,
  },
};
