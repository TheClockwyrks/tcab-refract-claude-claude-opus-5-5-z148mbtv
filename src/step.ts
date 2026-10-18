// One frame of the game: the transition `update` runs. Input is read here and
// handed to the screen machine in `flow.ts`; cues raised along the way are
// played once each at the end of the frame.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { RefractState } from "./game";
import type { FlowEffects } from "./flow";
import {
  back,
  clearBeams,
  confirm,
  copyState,
  navigate,
  pointerDown,
  pointerMove,
  pointerUp,
} from "./flow";

/** The arrow actions and the way each moves a highlight. */
const MOVES = [
  ["up", 0, -1],
  ["down", 0, 1],
  ["left", -1, 0],
  ["right", 1, 0],
] as const;

export function step(
  state: DeepReadonly<RefractState>,
  api: UpdateApi,
  dt: number,
): RefractState {
  const fx: FlowEffects = { cues: new Set(), random: Math.random };
  const input = api.input;
  let s: RefractState = { ...copyState(state), simTime: state.simTime + dt };

  if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());

  // Each pointer position is resolved on its own, in arrival order, so a sweep
  // grows and unwinds a beam one node at a time.
  for (const sample of input.pointerSamples()) {
    if (!sample.primary) continue;
    if (sample.type === "down")
      s = pointerDown(s, sample.x, sample.y, sample.device, fx);
    else if (sample.type === "move")
      s = pointerMove(s, sample.x, sample.y, sample.device, fx);
    else
      s = pointerUp(
        { ...s, pointer: { ...s.pointer, x: sample.x, y: sample.y } },
        sample.device,
        fx,
      );
  }
  const pointer = input.pointer();
  s = {
    ...s,
    pointer: {
      x: pointer.x,
      y: pointer.y,
      down: pointer.down,
      device: pointer.device,
    },
  };

  const menuScreen = s.screen !== "playing" && s.screen !== "howto";
  for (const [action, dx, dy] of MOVES) {
    if (input.pressed(action) && menuScreen) s = navigate(s, dx, dy);
  }
  if (input.pressed("confirm")) s = confirm(s, fx);
  if (input.pressed("back")) s = back(s);
  if (input.pressed("clear") && s.screen === "playing") s = clearBeams(s, fx);

  for (const cue of fx.cues) api.audio.play(cue);
  return { ...s, muted: api.audio.muted() };
}
