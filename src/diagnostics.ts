// The values Refract shows on the engine's debug overlay
// (specs/instrumentation.md, Diagnostics). Each source is a pure read of the
// state it is handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import { CHANNELS } from "./constants";
import type { RefractState } from "./game";
import { channelsPresent } from "./board";
import { beamOf, isBeamComplete, isSolved, spentAt } from "./rules";

export function registerDiagnostics(api: InitApi<RefractState>): void {
  const d = api.diagnostics;
  d.register("screen", (s) => s.screen);
  d.register("mode", (s) => s.mode);
  d.register("board", (s) =>
    s.board.nodes.length === 0 ? "none" : `${s.board.cols}x${s.board.rows}`,
  );
  for (const channel of CHANNELS) {
    d.register(`beam ${channel}`, (s) => {
      if (!channelsPresent(s.board).includes(channel)) return "-";
      const beam = beamOf(s.beams, channel);
      const segments = Math.max(0, beam.cells.length - 1);
      return `${segments} seg${isBeamComplete(s.board, beam) ? ", complete" : ", open"}`;
    });
  }
  d.register("crystals", (s) => {
    const crystals = s.board.nodes.filter((n) => n.kind === "crystal");
    if (crystals.length === 0) return "none";
    return crystals
      .map((n) => `(${n.col},${n.row}) ${spentAt(s.beams, n)}/${n.charges}`)
      .join(" ");
  });
  d.register(
    "solved",
    (s) => s.board.nodes.length > 0 && isSolved(s.board, s.beams),
  );
  d.register("pointer", (s) => {
    const p = s.pointer;
    return `${Math.round(p.x)},${Math.round(p.y)} ${p.device}${p.down ? " down" : ""}`;
  });
}
