// An exhaustive solver for Refract boards, and the five difficulty measures of
// specs/modes/cascade.md read off its results.
//
// The solver works over a compact index of the board (cells by reading-order
// index, segments by number) rather than the state's arrays, because Cascade's
// generator runs it over many candidate boards. Its legality test is the same
// R1 to R5 that `rules.ts` states over the state; the unit tests hold the two
// to agreement. Pruning only ever cuts branches no completion lies beyond, so
// the solutions it enumerates are exactly the board's.

import type { DeepReadonly } from "ts-essentials";
import { CHANNELS } from "./constants";
import type { BoardState } from "./game";

const EMPTY = -1;
const EMITTER = 0;
const LENS = 1;
const CRYSTAL = 2;

/** A board compiled for search. Cells are numbered `col + row * cols`. */
interface Graph {
  readonly size: number;
  readonly kind: Int8Array;
  readonly chan: Int8Array;
  readonly charges: Int8Array;
  /** Neighboring node cells of each cell, ascending. */
  readonly nbr: readonly (readonly number[])[];
  /** The segment joining each neighbor in `nbr`, index for index. */
  readonly nbrEdge: readonly (readonly number[])[];
  /** The segment crossing each segment inside its 2x2 block, or -1. */
  readonly partner: Int32Array;
  readonly edgeCount: number;
  /** Channel indices present, ascending. */
  readonly channels: readonly number[];
  /** Each channel's emitters in reading order, indexed by channel index. */
  readonly emitters: readonly (readonly number[])[];
  readonly lenses: readonly (readonly number[])[];
  readonly crystals: readonly number[];
  /** Twice the segment count of any solution: emitters + 2 per lens + 2 per charge. */
  readonly ends: number;
}

function compile(board: DeepReadonly<BoardState>): Graph {
  const { cols, rows } = board;
  const size = cols * rows;
  const kind = new Int8Array(size).fill(EMPTY);
  const chan = new Int8Array(size).fill(-1);
  const charges = new Int8Array(size);
  const emitters: number[][] = [[], [], []];
  const lenses: number[][] = [[], [], []];
  const crystals: number[] = [];
  let ends = 0;
  for (const node of board.nodes) {
    const i = node.col + node.row * cols;
    if (node.kind === "crystal") {
      kind[i] = CRYSTAL;
      charges[i] = node.charges ?? 0;
      crystals.push(i);
      ends += 2 * charges[i];
    } else {
      const c = CHANNELS.indexOf(node.channel ?? "triangle");
      kind[i] = node.kind === "emitter" ? EMITTER : LENS;
      chan[i] = c;
      (node.kind === "emitter" ? emitters : lenses)[c].push(i);
      ends += node.kind === "emitter" ? 1 : 2;
    }
  }
  for (const list of [...emitters, ...lenses, crystals])
    list.sort((a, b) => a - b);

  const edgeIndex = new Map<number, number>();
  const nbr: number[][] = [];
  const nbrEdge: number[][] = [];
  let edgeCount = 0;
  const edgeOf = (a: number, b: number): number => {
    const key = Math.min(a, b) * size + Math.max(a, b);
    let e = edgeIndex.get(key);
    if (e === undefined) {
      e = edgeCount;
      edgeCount += 1;
      edgeIndex.set(key, e);
    }
    return e;
  };
  for (let i = 0; i < size; i += 1) {
    const list: number[] = [];
    const edges: number[] = [];
    if (kind[i] !== EMPTY) {
      const c0 = i % cols;
      const r0 = Math.floor(i / cols);
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const c = c0 + dc;
          const r = r0 + dr;
          if (
            (dc === 0 && dr === 0) ||
            c < 0 ||
            r < 0 ||
            c >= cols ||
            r >= rows
          )
            continue;
          const j = c + r * cols;
          if (kind[j] === EMPTY) continue;
          list.push(j);
          edges.push(edgeOf(i, j));
        }
      }
    }
    nbr.push(list);
    nbrEdge.push(edges);
  }
  const partner = new Int32Array(edgeCount).fill(-1);
  for (const [key, e] of edgeIndex) {
    const a = Math.floor(key / size);
    const b = key % size;
    const ac = a % cols;
    const bc = b % cols;
    if (ac === bc || Math.floor(a / cols) === Math.floor(b / cols)) continue;
    // The crossing diagonal joins (bc, ar) and (ac, br).
    const p = bc + Math.floor(a / cols) * cols;
    const q = ac + Math.floor(b / cols) * cols;
    const other = edgeIndex.get(Math.min(p, q) * size + Math.max(p, q));
    if (other !== undefined) partner[e] = other;
  }
  const channels = [0, 1, 2].filter(
    (c) => emitters[c].length + lenses[c].length > 0,
  );
  return {
    size,
    kind,
    chan,
    charges,
    nbr,
    nbrEdge,
    partner,
    edgeCount,
    channels,
    emitters,
    lenses,
    crystals,
    ends,
  };
}

/** What one search found. */
interface SearchResult {
  /** Distinct solutions found, up to the cap. */
  readonly solutions: number;
  /** Whether the search ran out of budget before finishing. */
  readonly exhausted: boolean;
  /** Channel-and-segment pairs common to every solution found. */
  readonly determined: number;
  /** Sum and count of the branching tallies over the solutions found. */
  readonly branchSum: number;
  readonly branchSteps: number;
  /** The largest count of crystals crossed by two or more channels in one solution. */
  readonly sharedCrystals: number;
  /** The first solution found, as each channel's trail of cells. */
  readonly firstSolution: readonly (readonly number[])[] | null;
}

interface SearchOptions {
  /** Channel indices to draw, in order. */
  readonly channels: readonly number[];
  /** Whether every crystal must end exactly spent (a solution) or not (a route). */
  readonly requireCrystals: boolean;
  /** Stop once this many distinct results are found. */
  readonly cap: number;
  /** The most search steps to spend. */
  readonly budget: number;
}

/** The exhaustive search over one or more channels' beams. */
function search(g: Graph, opts: SearchOptions): SearchResult {
  const used = new Int8Array(g.edgeCount); // channel index + 1, or 0
  const remain = Int8Array.from(g.charges);
  const visited = new Uint8Array(g.size); // lenses threaded, emitters spent
  const branch: number[] = [];
  const seen = new Set<string>();
  const determined = new Int8Array(g.edgeCount);
  const channelMask = new Uint8Array(g.size);
  const bfsMark = new Int32Array(g.size);
  const queue = new Int32Array(g.size);
  let bfsStamp = 0;
  let steps = 0;
  let exhausted = false;
  let solutions = 0;
  let branchSum = 0;
  let branchSteps = 0;
  let sharedCrystals = 0;
  let firstSolution: number[][] | null = null;
  const lastChannel = opts.channels[opts.channels.length - 1];
  const order = new Int8Array(3).fill(-1);
  opts.channels.forEach((c, i) => (order[c] = i));
  const laterChannel = (c: number, ch: number): boolean => order[c] > order[ch];
  const trails: number[][] = opts.channels.map(() => []);

  const free = (e: number): boolean =>
    used[e] === 0 && (g.partner[e] < 0 || used[g.partner[e]] === 0);

  /** Whether a beam of channel `c` may still enter `x`. */
  const passable = (x: number, c: number): boolean => {
    const k = g.kind[x];
    if (k === CRYSTAL) return remain[x] > 0;
    return g.chan[x] === c && visited[x] === 0;
  };

  /** Free segments from `w` to cells a beam of `c` could still use, plus the live end. */
  const degree = (w: number, c: number, live: number): number => {
    let d = 0;
    const ns = g.nbr[w];
    const es = g.nbrEdge[w];
    for (let i = 0; i < ns.length; i += 1) {
      if (!free(es[i])) continue;
      const x = ns[i];
      if (x === live || passable(x, c)) d += 1;
    }
    return d;
  };

  /** Free segments from crystal `w` to anything a beam could still use. */
  const crystalDegree = (w: number, live: number): number => {
    let d = 0;
    const ns = g.nbr[w];
    const es = g.nbrEdge[w];
    for (let i = 0; i < ns.length; i += 1) {
      if (!free(es[i])) continue;
      const x = ns[i];
      if (x === live || g.kind[x] === CRYSTAL || visited[x] === 0) d += 1;
    }
    return d;
  };

  /** Necessary conditions around a freshly moved live end `v` of channel `ch`. */
  const viable = (
    ch: number,
    u: number,
    v: number,
    target: number,
  ): boolean => {
    const check = (w: number): boolean => {
      const k = g.kind[w];
      if (k === CRYSTAL) {
        if (!opts.requireCrystals || remain[w] === 0) return true;
        return crystalDegree(w, v) >= 2 * remain[w] + (w === v ? 1 : 0);
      }
      if (visited[w] !== 0 || w === v) return true;
      const c = g.chan[w];
      if (c !== ch && !(opts.requireCrystals && laterChannel(c, ch)))
        return true;
      const live = c === ch ? v : -1;
      return degree(w, c, live) >= (k === LENS ? 2 : 1);
    };
    for (const w of g.nbr[v]) if (!check(w)) return false;
    if (u >= 0) for (const w of g.nbr[u]) if (!check(w)) return false;
    if (!check(v)) return false;

    // Everything the beam has still to reach must be reachable from its end.
    bfsStamp += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = v;
    bfsMark[v] = bfsStamp;
    while (head < tail) {
      const x = queue[head++];
      if (x === target) continue;
      const ns = g.nbr[x];
      const es = g.nbrEdge[x];
      for (let i = 0; i < ns.length; i += 1) {
        const y = ns[i];
        if (bfsMark[y] === bfsStamp || !free(es[i]) || !passable(y, ch))
          continue;
        bfsMark[y] = bfsStamp;
        queue[tail++] = y;
      }
    }
    if (bfsMark[target] !== bfsStamp) return false;
    for (const lens of g.lenses[ch]) {
      if (visited[lens] === 0 && bfsMark[lens] !== bfsStamp) return false;
    }
    if (opts.requireCrystals && ch === lastChannel) {
      for (const cr of g.crystals) {
        if (remain[cr] > 0 && bfsMark[cr] !== bfsStamp) return false;
      }
    }
    return true;
  };

  const record = (): void => {
    const perChannel: number[][] = opts.channels.map(() => []);
    for (let e = 0; e < g.edgeCount; e += 1) {
      if (used[e] !== 0) perChannel[opts.channels.indexOf(used[e] - 1)].push(e);
    }
    const key = perChannel.map((list) => list.join(",")).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    if (solutions === 0) {
      determined.set(used);
      firstSolution = trails.map((t) => [...t]);
    } else {
      for (let e = 0; e < g.edgeCount; e += 1) {
        if (determined[e] !== used[e]) determined[e] = 0;
      }
    }
    solutions += 1;
    for (const b of branch) branchSum += b;
    branchSteps += branch.length;
    if (opts.requireCrystals && g.crystals.length > 0) {
      channelMask.fill(0);
      for (let x = 0; x < g.size; x += 1) {
        if (g.kind[x] !== CRYSTAL) continue;
        const es = g.nbrEdge[x];
        for (const e of es)
          if (used[e] !== 0) channelMask[x] |= 1 << (used[e] - 1);
      }
      let shared = 0;
      for (const cr of g.crystals) {
        const m = channelMask[cr];
        if ((m & (m - 1)) !== 0) shared += 1;
      }
      sharedCrystals = Math.max(sharedCrystals, shared);
    }
  };

  const done = (): boolean => exhausted || solutions >= opts.cap;

  const runChannel = (index: number): void => {
    if (index === opts.channels.length) {
      if (opts.requireCrystals) {
        for (const cr of g.crystals) if (remain[cr] !== 0) return;
      }
      record();
      return;
    }
    const ch = opts.channels[index];
    const [start, target] = g.emitters[ch];
    visited[start] = 1;
    trails[index].push(start);
    if (viable(ch, -1, start, target)) walk(index, ch, start, target);
    trails[index].pop();
    visited[start] = 0;
  };

  const walk = (index: number, ch: number, u: number, target: number): void => {
    steps += 1;
    if (steps > opts.budget) {
      exhausted = true;
      return;
    }
    const ns = g.nbr[u];
    const es = g.nbrEdge[u];
    let legal = 0;
    for (let i = 0; i < ns.length; i += 1) {
      if (free(es[i]) && passable(ns[i], ch)) legal += 1;
    }
    branch.push(legal);
    for (let i = 0; i < ns.length && !done(); i += 1) {
      const v = ns[i];
      const e = es[i];
      if (!free(e) || !passable(v, ch)) continue;
      used[e] = ch + 1;
      const isCrystal = g.kind[v] === CRYSTAL;
      if (isCrystal) remain[v] -= 1;
      else visited[v] = 1;
      trails[index].push(v);
      if (v === target) {
        let threaded = true;
        for (const lens of g.lenses[ch])
          if (visited[lens] === 0) threaded = false;
        if (threaded) runChannel(index + 1);
      } else if (viable(ch, u, v, target)) {
        walk(index, ch, v, target);
      }
      trails[index].pop();
      if (isCrystal) remain[v] += 1;
      else visited[v] = 0;
      used[e] = 0;
    }
    branch.pop();
  };

  const solvable = opts.channels.every((c) => g.emitters[c].length === 2);
  if (solvable) runChannel(0);

  let det = 0;
  if (solutions > 0) for (const d of determined) if (d !== 0) det += 1;
  return {
    solutions,
    exhausted,
    determined: det,
    branchSum,
    branchSteps,
    sharedCrystals,
    firstSolution,
  };
}

/** The five measures of specs/modes/cascade.md, plus whether they are exact. */
export interface Measures {
  /** Distinct solutions, counted up to `solutionCap` + 1. */
  readonly solutions: number;
  /** The fewest routes any channel admits, counted up to `routeCap`. */
  readonly minRoutes: number;
  /** Channel-and-segment pairs in every solution, as a share of L. */
  readonly determinedShare: number;
  /** The mean legal-move count over every segment of every solution. */
  readonly branching: number;
  /** The most crystals crossed by two or more channels in one solution. */
  readonly sharedCrystals: number;
  /** True when a search ran out of budget, so the figures are not exact. */
  readonly exhausted: boolean;
}

export interface MeasureOptions {
  readonly solutionCap?: number;
  readonly routeCap?: number;
  readonly budget?: number;
}

/**
 * Measures a board. Solutions are counted up to `solutionCap + 1`, so a count
 * above the cap means "more than the cap", and routes up to `routeCap`.
 */
export function measureBoard(
  board: DeepReadonly<BoardState>,
  options: MeasureOptions = {},
): Measures {
  const solutionCap = options.solutionCap ?? 1024;
  const routeCap = options.routeCap ?? 1024;
  const budget = options.budget ?? 2_000_000;
  const g = compile(board);
  const result = search(g, {
    channels: g.channels,
    requireCrystals: true,
    cap: solutionCap + 1,
    budget,
  });
  let exhausted = result.exhausted;
  let minRoutes = Infinity;
  if (result.solutions > 0 && !exhausted) {
    for (const c of g.channels) {
      const routes = search(g, {
        channels: [c],
        requireCrystals: false,
        cap: routeCap,
        budget,
      });
      exhausted = exhausted || routes.exhausted;
      minRoutes = Math.min(minRoutes, routes.solutions);
    }
  }
  const segments = g.ends / 2;
  return {
    solutions: result.solutions,
    minRoutes:
      g.channels.length === 0 ? 0 : minRoutes === Infinity ? 0 : minRoutes,
    determinedShare: segments > 0 ? result.determined / segments : 1,
    branching:
      result.branchSteps > 0 ? result.branchSum / result.branchSteps : 0,
    sharedCrystals: result.sharedCrystals,
    exhausted,
  };
}

/** Whether a board admits at least one solution. */
export function isSolvable(
  board: DeepReadonly<BoardState>,
  budget = 2_000_000,
): boolean {
  const g = compile(board);
  const result = search(g, {
    channels: g.channels,
    requireCrystals: true,
    cap: 1,
    budget,
  });
  return result.solutions > 0;
}

/**
 * One solution of a board, as the cells of each channel's beam in drawn order
 * from its first emitter, or null when it has none within the budget.
 */
export function solveBoard(
  board: DeepReadonly<BoardState>,
  budget = 2_000_000,
):
  | {
      channel: (typeof CHANNELS)[number];
      cells: { col: number; row: number }[];
    }[]
  | null {
  const g = compile(board);
  const result = search(g, {
    channels: g.channels,
    requireCrystals: true,
    cap: 1,
    budget,
  });
  if (result.firstSolution === null) return null;
  const trails = result.firstSolution;
  return g.channels.map((c, index) => ({
    channel: CHANNELS[c],
    cells: trails[index].map((i) => ({
      col: i % board.cols,
      row: Math.floor(i / board.cols),
    })),
  }));
}
