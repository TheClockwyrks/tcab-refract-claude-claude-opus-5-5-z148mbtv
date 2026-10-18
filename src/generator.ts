// Cascade's board generator (specs/modes/cascade.md).
//
// A candidate is planted rather than guessed: one random walk per channel is
// laid across the grid under the limits of specs/beams.md, the cells each walk
// threads become that channel's lenses, its two ends its emitters, and a cell
// crossed more than once becomes a crystal carrying one charge per crossing.
// Planting guarantees the candidate is solvable; the solver then measures it
// against the tier's floor, and a candidate that misses any bound is thrown
// away and another drawn.

import type { DeepReadonly } from "ts-essentials";
import { CHANNELS, MAX_TIER, TIER_ADVANCE, TIERS } from "./constants";
import type { Tier } from "./constants";
import type { BoardState, NodeState } from "./game";
import { measureBoard } from "./solver";
import type { Measures } from "./solver";

/** A source of uniform numbers in `[0, 1)`, such as `Math.random`. */
export type Random = () => number;

/** A small seeded generator, so a run of boards can be reproduced. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** The ladder rung for a tier, clamped onto the ladder. */
export function tierSpec(tier: number): Tier {
  const t = Math.min(MAX_TIER, Math.max(1, Math.floor(tier)));
  return TIERS[t - 1];
}

/** `min(floor(solvedCount / TIER_ADVANCE) + 1, MAX_TIER)`, from specs/modes/cascade.md. */
export function tierFor(solvedCount: number): number {
  return Math.min(Math.floor(solvedCount / TIER_ADVANCE) + 1, MAX_TIER);
}

/** Whether measured figures meet every bound a tier's row of the floor states. */
export function meetsFloor(
  board: DeepReadonly<BoardState>,
  m: Measures,
  spec: Tier,
): boolean {
  const empty = board.cols * board.rows - board.nodes.length;
  const crystals = board.nodes.filter((n) => n.kind === "crystal");
  const channels = new Set(
    board.nodes.map((n) => n.channel).filter((c) => c !== null),
  );
  return (
    !m.exhausted &&
    board.cols >= spec.minCols &&
    board.cols <= spec.maxCols &&
    board.rows >= spec.minRows &&
    board.rows <= spec.maxRows &&
    channels.size === spec.channels &&
    CHANNELS.slice(0, spec.channels).every((c) => channels.has(c)) &&
    crystals.length >= spec.minCrystals &&
    crystals.length <= spec.maxCrystals &&
    crystals.every(
      (n) =>
        (n.charges ?? 0) >= spec.minCharges &&
        (n.charges ?? 0) <= spec.maxCharges,
    ) &&
    empty <= spec.maxEmptyCells &&
    m.minRoutes >= spec.minRoutes &&
    m.solutions >= spec.minSolutions &&
    m.solutions <= spec.maxSolutions &&
    m.determinedShare <= spec.maxDeterminedShare &&
    m.branching >= spec.minBranching &&
    m.sharedCrystals >= spec.minSharedCrystals
  );
}

const DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/**
 * Lays one candidate board of `cols` by `rows` for a tier, or returns null when
 * the walks could not cover enough of the grid.
 */
export function plantBoard(
  spec: Tier,
  cols: number,
  rows: number,
  random: Random,
): BoardState | null {
  const size = cols * rows;
  // Per cell: the channel that first threaded it (-1 for none), the number of
  // crossings, and whether it is an end.
  let owner = new Int8Array(size).fill(-1);
  let visits = new Int8Array(size);
  let isEnd = new Uint8Array(size);
  let usedSegs = new Set<number>();
  const segId = (a: number, b: number): number =>
    Math.min(a, b) * size + Math.max(a, b);
  const crystalTarget = randInt(random, spec.minCrystals, spec.maxCrystals);
  const maxVisits = Math.max(1, spec.maxCharges);
  let crystals = 0;
  let walker = 0;
  // Holes in the grid are what keep a dense board from admitting too many answers.
  const emptyGoal = randInt(
    random,
    0,
    Math.floor(spec.maxEmptyCells * EMPTY_SHARE),
  );

  /** The cells the walk of channel `walker`, standing at `u`, may step to. */
  const options = (u: number): { cell: number; revisit: boolean }[] => {
    const out: { cell: number; revisit: boolean }[] = [];
    const uc = u % cols;
    const ur = Math.floor(u / cols);
    for (const [dc, dr] of DIRS) {
      const c = uc + dc;
      const r = ur + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const v = c + r * cols;
      if (usedSegs.has(segId(u, v))) continue;
      if (dc !== 0 && dr !== 0) {
        const p = c + ur * cols;
        const q = uc + r * cols;
        if (usedSegs.has(segId(p, q))) continue;
      }
      if (visits[v] === 0) out.push({ cell: v, revisit: false });
      else if (
        isEnd[v] === 0 &&
        visits[v] < maxVisits &&
        (visits[v] >= 2 || (crystals < crystalTarget && owner[v] !== walker))
      ) {
        out.push({ cell: v, revisit: true });
      }
    }
    return out;
  };

  const onwardFree = (v: number): number => {
    const vc = v % cols;
    const vr = Math.floor(v / cols);
    let n = 0;
    for (const [dc, dr] of DIRS) {
      const c = vc + dc;
      const r = vr + dr;
      if (
        c >= 0 &&
        r >= 0 &&
        c < cols &&
        r < rows &&
        visits[c + r * cols] === 0
      )
        n += 1;
    }
    return n;
  };

  /** Lays one walk for channel `ch` into the working arrays; returns its fresh-cell count. */
  const walk = (ch: number, target: number): number => {
    const free: number[] = [];
    for (let i = 0; i < size; i += 1) if (visits[i] === 0) free.push(i);
    if (free.length < 2) return 0;
    // Prefer starting where few free neighbors remain, so corners fill first.
    const keyed = free.map((cell) => ({
      cell,
      key: onwardFree(cell) + random() * 3,
    }));
    keyed.sort((x, y) => x.key - y.key);
    const start = keyed[0].cell;
    const path = [start];
    visits[start] = 1;
    owner[start] = ch;
    isEnd[start] = 1;
    let fresh = 1;
    for (;;) {
      const u = path[path.length - 1];
      const opts = options(u);
      if (opts.length === 0) break;
      const wantRevisit = crystals < crystalTarget && random() < 0.35;
      const pool = opts.filter((o) => o.revisit === wantRevisit);
      const choices = pool.length > 0 ? pool : opts;
      // Warnsdorff with noise: prefer fresh cells with few onward options.
      let best = choices[0];
      let bestScore = Infinity;
      for (const o of choices) {
        const score =
          (o.revisit ? (owner[o.cell] === ch ? 6 : 2) : onwardFree(o.cell)) +
          random() * 2.5;
        if (score < bestScore) {
          bestScore = score;
          best = o;
        }
      }
      const v = best.cell;
      usedSegs.add(segId(u, v));
      if (best.revisit) {
        if (visits[v] === 1) crystals += 1;
      } else {
        owner[v] = ch;
        fresh += 1;
      }
      visits[v] += 1;
      path.push(v);
      if (fresh >= target && !best.revisit) break;
    }
    // A walk ends on a cell it threaded once; back off any crossings at its tail.
    while (path.length > 1 && visits[path[path.length - 1]] > 1) {
      const v = path.pop() as number;
      const u = path[path.length - 1];
      usedSegs.delete(segId(u, v));
      visits[v] -= 1;
      if (visits[v] === 1) crystals -= 1;
    }
    if (path.length < 2) return 0;
    isEnd[path[path.length - 1]] = 1;
    return fresh;
  };

  for (let ch = 0; ch < spec.channels; ch += 1) {
    walker = ch;
    let budget = 0;
    for (let i = 0; i < size; i += 1) if (visits[i] === 0) budget += 1;
    const last = ch === spec.channels - 1;
    const goal = Math.max(2, budget - emptyGoal);
    const target = last
      ? goal
      : Math.max(
          2,
          Math.round((goal / (spec.channels - ch)) * (0.8 + random() * 0.4)),
        );
    // Try several walks from the same position and keep the best of them.
    const base = { owner, visits, isEnd, usedSegs, crystals };
    let best: typeof base | null = null;
    let bestScore = -Infinity;
    for (let tryIndex = 0; tryIndex < WALK_TRIES; tryIndex += 1) {
      owner = Int8Array.from(base.owner);
      visits = Int8Array.from(base.visits);
      isEnd = Uint8Array.from(base.isEnd);
      usedSegs = new Set(base.usedSegs);
      crystals = base.crystals;
      const fresh = walk(ch, target);
      if (fresh < 2) continue;
      const cover = last ? fresh : -Math.abs(fresh - target);
      const score = cover + 2 * Math.min(crystals, crystalTarget) + random();
      if (score > bestScore) {
        bestScore = score;
        best = { owner, visits, isEnd, usedSegs, crystals };
      }
    }
    if (best === null) return null;
    ({ owner, visits, isEnd, usedSegs, crystals } = best);
  }

  // Top up the crystal count with single-charge crystals on threaded cells.
  if (crystals < spec.minCrystals && spec.minCharges <= 1) {
    const singles: number[] = [];
    for (let i = 0; i < size; i += 1)
      if (visits[i] === 1 && isEnd[i] === 0) singles.push(i);
    while (crystals < spec.minCrystals && singles.length > 0) {
      const pick = singles.splice(Math.floor(random() * singles.length), 1)[0];
      visits[pick] = -1;
      crystals += 1;
    }
  }

  const nodes: NodeState[] = [];
  for (let i = 0; i < size; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (visits[i] === 0) continue;
    if (visits[i] === -1 || visits[i] > 1) {
      nodes.push({
        col,
        row,
        kind: "crystal",
        channel: null,
        charges: Math.abs(visits[i]),
      });
    } else {
      nodes.push({
        col,
        row,
        kind: isEnd[i] === 1 ? "emitter" : "lens",
        channel: CHANNELS[owner[i]],
        charges: null,
      });
    }
  }
  return { cols, rows, nodes };
}

/** The largest share of a tier's empty-cell allowance a candidate aims to leave empty. */
const EMPTY_SHARE = 0.6;

/** How many walks are tried for each channel of a candidate. */
const WALK_TRIES = 10;

/** How many candidates a call may plant before it gives up. */
const MAX_ATTEMPTS = 20000;

/**
 * Generates one board at `tier`: drawn at random within the tier's row of the
 * ladder and meeting every bound of its floor.
 */
export function generateBoard(tier: number, random: Random): BoardState {
  if (!Number.isInteger(tier) || tier < 1 || tier > MAX_TIER) {
    throw new RangeError(
      `Refract: tier ${tier} is not on the ladder 1..${MAX_TIER}`,
    );
  }
  const spec = tierSpec(tier);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const cols = randInt(random, spec.minCols, spec.maxCols);
    const rows = randInt(random, spec.minRows, spec.maxRows);
    const board = plantBoard(spec, cols, rows, random);
    if (board === null) continue;
    if (cols * rows - board.nodes.length > spec.maxEmptyCells) continue;
    const m = measureBoard(board, {
      solutionCap: spec.maxSolutions,
      routeCap: spec.minRoutes,
      budget: 150_000,
    });
    if (meetsFloor(board, m, spec)) return board;
  }
  throw new Error(`Refract: no board met tier ${tier}'s floor`);
}
