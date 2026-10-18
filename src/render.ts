// The look of the optical bench: every screen, drawn from the state alone.
// Nothing here writes to the state; the renderer only reads it.

import type { DeepReadonly } from "ts-essentials";
import {
  CAMPAIGN_LENGTH,
  CHANNELS,
  CLEAR_LABEL,
  BACK_LABEL,
  HUD_SOLVED_LABEL,
  HUD_TIER_LABEL,
  NODE_HIT_R,
  SET_LABELS,
  SOLVED_TITLE_TEXT,
  STAGE_H,
  STAGE_W,
  TAGLINE_TEXT,
  TITLE_TEXT,
} from "./constants";
import { boardExtent, cellX, cellY, channelsPresent, nodeUnder } from "./board";
import type { Box } from "./board";
import { SET_SIZE } from "./campaign-boards";
import {
  CHANNEL_HUES,
  COLORS,
  drawButton,
  drawCrystal,
  drawEmitter,
  drawLens,
  roundRect,
  silhouette,
  text,
  textWidth,
  withAlpha,
  wrap,
} from "./draw";
import type { BeamState, Channel, RefractState } from "./game";
import { isUnlocked } from "./flow";
import {
  beamOf,
  canExtend,
  isBeamComplete,
  segmentsAt,
  spentAt,
} from "./rules";
import {
  BACK_BOX,
  CLEAR_BOX,
  SELECT_GRID,
  SOLVED_PANEL,
  contains,
  menuBoxes,
  menuItems,
  selectCell,
} from "./targets";

type Ctx = CanvasRenderingContext2D;
type State = DeepReadonly<RefractState>;

/** The radius a node's form reaches, inside NODE_R with room for its stroke. */
const FORM_R = 24;

/** How fast light runs along a drawn beam, in stage units per second. */
const PHOTON_SPEED = 150;

/** The spacing of the photons running along a beam. */
const PHOTON_GAP = 120;

export function renderGame(s: State, ctx: Ctx): void {
  drawBackdrop(ctx, s);
  switch (s.screen) {
    case "title":
      drawTitle(ctx, s);
      break;
    case "howto":
      drawHowTo(ctx, s);
      break;
    case "select":
      drawSelect(ctx, s);
      break;
    case "playing":
      drawPlaying(ctx, s);
      break;
    case "solved":
      drawSolved(ctx, s);
      break;
    case "complete":
      drawComplete(ctx, s);
      break;
  }
  if (s.muted) {
    text(ctx, "SOUND OFF  ·  M", STAGE_W - 24, STAGE_H - 18, {
      size: 14,
      color: COLORS.dim,
      align: "right",
      spacing: 1,
    });
  }
}

/** The bench itself: a dark field with faint rails and a vignette. */
function drawBackdrop(ctx: Ctx, s: State): void {
  ctx.save();
  const glow = ctx.createRadialGradient(640, 380, 60, 640, 380, 760);
  glow.addColorStop(0, "#0e1424");
  glow.addColorStop(1, "#05070d");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  // Optical rails along the bench, drawn only where the board is not.
  const board =
    s.screen === "playing" || s.screen === "solved"
      ? boardExtent(s.board)
      : null;
  ctx.strokeStyle = "rgba(120, 140, 210, 0.05)";
  ctx.lineWidth = 1;
  for (let y = 24; y < STAGE_H; y += 48) {
    ctx.beginPath();
    if (
      board !== null &&
      s.board.nodes.length > 0 &&
      y > board.y &&
      y < board.y + board.h
    ) {
      ctx.moveTo(0, y);
      ctx.lineTo(board.x - 8, y);
      ctx.moveTo(board.x + board.w + 8, y);
      ctx.lineTo(STAGE_W, y);
    } else {
      ctx.moveTo(0, y);
      ctx.lineTo(STAGE_W, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function heading(ctx: Ctx, title: string, sub: string | null): void {
  text(ctx, title, 640, 66, {
    size: 36,
    weight: 700,
    align: "center",
    spacing: 6,
  });
  if (sub !== null) {
    text(ctx, sub, 640, 100, {
      size: 15,
      weight: 600,
      color: COLORS.dim,
      align: "center",
      spacing: 4,
    });
  }
}

function footer(ctx: Ctx, value: string): void {
  text(ctx, value, 640, 702, {
    size: 14,
    weight: 600,
    color: COLORS.dim,
    align: "center",
    spacing: 2,
  });
}

function hovering(s: State, box: Box): boolean {
  return (
    s.pointer.device !== "touch" && contains(box, s.pointer.x, s.pointer.y)
  );
}

function pressedOn(s: State, id: string): boolean {
  return s.armedTarget === id;
}

function drawMenu(ctx: Ctx, s: State, accent: string, size = 24): void {
  const items = menuItems(s);
  menuBoxes(s).forEach((box, i) => {
    drawButton(ctx, box, items[i], {
      size,
      highlighted: i === s.menuIndex,
      hovered: hovering(s, box) || pressedOn(s, box.id),
      color: accent,
    });
  });
}

// ---- title ----------------------------------------------------------------

/** A prism splitting a white beam into the three channel hues. */
function drawPrism(
  ctx: Ctx,
  cx: number,
  cy: number,
  size: number,
  t: number,
): void {
  ctx.save();
  ctx.lineCap = "round";
  const left = cx - size * 0.5;
  // The incoming white beam.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 420, cy + 10);
  ctx.lineTo(left + size * 0.22, cy + 4);
  ctx.stroke();
  // The fanned channels.
  CHANNELS.forEach((channel, i) => {
    const hue = CHANNEL_HUES[channel];
    const spread = (i - 1) * 46 + Math.sin(t * 0.8 + i) * 3;
    ctx.strokeStyle = withAlpha(hue, 0.22);
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.18, cy + 2);
    ctx.lineTo(cx + 420, cy + spread);
    ctx.stroke();
    ctx.strokeStyle = hue;
    ctx.lineWidth = 3;
    ctx.stroke();
  });
  // The prism.
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.55, cy + size * 0.42);
  ctx.lineTo(cx - size * 0.55, cy + size * 0.42);
  ctx.closePath();
  ctx.fillStyle = "rgba(20, 28, 52, 0.95)";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawTitle(ctx: Ctx, s: State): void {
  drawPrism(ctx, 640, 120, 92, s.simTime);
  text(ctx, TITLE_TEXT, 640, 262, {
    size: 92,
    weight: 800,
    align: "center",
    spacing: 18,
  });
  text(ctx, TAGLINE_TEXT, 640, 312, {
    size: 20,
    weight: 600,
    color: COLORS.dim,
    align: "center",
    spacing: 8,
  });
  drawMenu(ctx, s, CHANNEL_HUES.triangle);
  footer(ctx, "ARROWS + ENTER  ·  OR POINT AND PRESS  ·  M MUTES");
}

// ---- how to play ----------------------------------------------------------

const HOWTO_LINES: readonly string[] = [
  "Every colour of light is a channel with two EMITTERS, the outlined shapes, and any number of LENSES, the filled shapes of the same colour.",
  "Press on an emitter and drag from node to node to draw its beam. Let go whenever you like: the beam stays just as you drew it. Press either end to carry on, or a node along it to cut back to there.",
  "A beam is finished when it runs from one of its emitters to the other and threads every lens of its channel.",
  "A beam steps to any of the eight nodes around it, diagonals included, but never across an empty cell, and never touches another channel's emitters or lenses.",
  "CRYSTALS belong to no channel. Any beam may cross one, and each crossing spends a charge. Every charge must be spent, no more and no fewer.",
  "Each link between two nodes is drawn once and carries one beam. Links never cross, so only one of the two diagonals of a square of four cells can be drawn.",
  "A move the rules don't allow simply doesn't take, and the beam stays as it was. Light every channel and spend every crystal to solve the board.",
];

function drawHowTo(ctx: Ctx, s: State): void {
  heading(ctx, "HOW TO PLAY", "THE RULES OF THE BENCH");
  drawButton(ctx, BACK_BOX, BACK_LABEL, {
    hovered: hovering(s, BACK_BOX) || pressedOn(s, "back"),
  });
  const style = { size: 17, weight: 500, color: "#d7dcec" } as const;
  let y = 160;
  for (const paragraph of HOWTO_LINES) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(92, y - 6, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.dim;
    ctx.fill();
    ctx.restore();
    for (const line of wrap(ctx, paragraph, 690, style)) {
      text(ctx, line, 110, y, style);
      y += 24;
    }
    y += 12;
  }
  // The legend.
  const lx = 880;
  text(ctx, "THE NODES", lx, 168, { size: 15, color: COLORS.dim, spacing: 3 });
  const rows: [string, string, (cx: number, cy: number) => void][] = [
    [
      "EMITTER",
      "a beam's end",
      (cx, cy) => drawEmitter(ctx, "triangle", cx, cy, FORM_R, false),
    ],
    [
      "LENS",
      "thread it once",
      (cx, cy) => drawLens(ctx, "triangle", cx, cy, FORM_R, false),
    ],
    [
      "CRYSTAL",
      "spend every charge",
      (cx, cy) => drawCrystal(ctx, cx, cy, 25, 2, 1),
    ],
  ];
  rows.forEach(([name, note, draw], i) => {
    const cy = 222 + i * 78;
    draw(lx + 30, cy);
    text(ctx, name, lx + 76, cy - 2, { size: 20, weight: 700 });
    text(ctx, note, lx + 76, cy + 22, {
      size: 15,
      weight: 500,
      color: COLORS.dim,
    });
  });
  text(ctx, "THE CHANNELS", lx, 470, {
    size: 15,
    color: COLORS.dim,
    spacing: 3,
  });
  CHANNELS.forEach((channel, i) => {
    const cx = lx + 30 + i * 90;
    drawEmitter(ctx, channel, cx, 516, 20, false);
    drawLens(ctx, channel, cx + 40, 516, 14, false);
  });
  text(ctx, "CONTROLS", 110, 650, { size: 15, color: COLORS.dim, spacing: 3 });
  text(
    ctx,
    "Mouse, pen or touch draws  ·  R clears the board  ·  Esc goes back  ·  M mutes  ·  Arrows and Enter work every menu",
    110,
    678,
    { size: 16, weight: 500, color: "#d7dcec" },
  );
}

// ---- select ---------------------------------------------------------------

function drawLock(ctx: Ctx, cx: number, cy: number): void {
  ctx.save();
  ctx.strokeStyle = COLORS.faint;
  ctx.fillStyle = COLORS.faint;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy - 4, 5, Math.PI, 0);
  ctx.stroke();
  ctx.fillRect(cx - 7, cy - 4, 14, 10);
  ctx.restore();
}

function drawCheck(ctx: Ctx, cx: number, cy: number): void {
  ctx.save();
  ctx.strokeStyle = COLORS.solved;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx - 1, cy + 5);
  ctx.lineTo(cx + 7, cy - 5);
  ctx.stroke();
  ctx.restore();
}

function drawSelect(ctx: Ctx, s: State): void {
  heading(ctx, "CAMPAIGN", "CHOOSE A BOARD");
  drawButton(ctx, BACK_BOX, BACK_LABEL, {
    hovered: hovering(s, BACK_BOX) || pressedOn(s, "back"),
  });
  SET_LABELS.forEach((label, row) => {
    const box = selectCell(row * SET_SIZE);
    text(ctx, label, SELECT_GRID.x - 24, box.y + box.h / 2 + 6, {
      size: 17,
      weight: 700,
      color: COLORS.dim,
      align: "right",
      spacing: 3,
    });
  });
  for (let i = 0; i < CAMPAIGN_LENGTH; i += 1) {
    const box = selectCell(i);
    const solved = s.solvedBoards.includes(i);
    const open = isUnlocked(s, i);
    const highlighted = i === s.selectIndex;
    ctx.save();
    roundRect(ctx, box, 12);
    ctx.fillStyle = solved
      ? "rgba(124, 242, 196, 0.12)"
      : open
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(255, 255, 255, 0.015)";
    ctx.fill();
    if (!open) ctx.setLineDash([5, 5]);
    ctx.strokeStyle = highlighted
      ? "#ffffff"
      : solved
        ? withAlpha(COLORS.solved, 0.7)
        : open
          ? COLORS.dim
          : COLORS.faint;
    ctx.lineWidth = highlighted ? 3.5 : 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    if (highlighted) {
      roundRect(
        ctx,
        { x: box.x - 5, y: box.y - 5, w: box.w + 10, h: box.h + 10 },
        15,
      );
      ctx.strokeStyle = withAlpha(CHANNEL_HUES.triangle, 0.6);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    text(
      ctx,
      String(i + 1),
      box.x + box.w / 2,
      box.y + box.h / 2 + (open ? 2 : -4),
      {
        size: open ? 30 : 22,
        weight: 700,
        color: open ? COLORS.ink : COLORS.faint,
        align: "center",
        baseline: "middle",
      },
    );
    if (!open) drawLock(ctx, box.x + box.w / 2, box.y + box.h - 18);
    if (solved) drawCheck(ctx, box.x + box.w - 16, box.y + 16);
  }
  const solvedCount = s.solvedBoards.length;
  text(ctx, `${solvedCount} OF ${CAMPAIGN_LENGTH} SOLVED`, 640, 616, {
    size: 18,
    weight: 700,
    color: solvedCount > 0 ? COLORS.solved : COLORS.dim,
    align: "center",
    spacing: 3,
  });
  footer(ctx, "ARROWS MOVE  ·  ENTER PLAYS  ·  ESC RETURNS TO THE TITLE");
}

// ---- the board ------------------------------------------------------------

/** The beam's path from cell center to cell center. */
function tracePath(ctx: Ctx, s: State, beam: DeepReadonly<BeamState>): void {
  ctx.beginPath();
  beam.cells.forEach((c, i) => {
    const x = cellX(c.col, s.board.cols);
    const y = cellY(c.row, s.board.rows);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

function drawBeam(
  ctx: Ctx,
  s: State,
  beam: DeepReadonly<BeamState>,
  complete: boolean,
): void {
  if (beam.cells.length < 2) return;
  const hue = CHANNEL_HUES[beam.channel];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  tracePath(ctx, s, beam);
  ctx.strokeStyle = withAlpha(hue, complete ? 0.28 : 0.16);
  ctx.lineWidth = complete ? 22 : 16;
  ctx.stroke();
  ctx.strokeStyle = withAlpha(hue, 0.9);
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = complete ? "#ffffff" : withAlpha("#ffffff", 0.55);
  ctx.lineWidth = 2;
  ctx.stroke();
  // Photons running along the beam from its first cell.
  const points = beam.cells.map((c) => [
    cellX(c.col, s.board.cols),
    cellY(c.row, s.board.rows),
  ]);
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  const offset = (s.simTime * PHOTON_SPEED) % PHOTON_GAP;
  ctx.fillStyle = "#ffffff";
  for (let d = offset; d < total; d += PHOTON_GAP) {
    let rest = d;
    let i = 0;
    while (i < lengths.length - 1 && rest > lengths[i]) {
      rest -= lengths[i];
      i += 1;
    }
    const f = lengths[i] === 0 ? 0 : rest / lengths[i];
    const x = points[i][0] + (points[i + 1][0] - points[i][0]) * f;
    const y = points[i][1] + (points[i + 1][1] - points[i][1]) * f;
    ctx.beginPath();
    ctx.arc(x, y, complete ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoard(ctx: Ctx, s: State, interactive: boolean): void {
  const board = s.board;
  if (board.nodes.length === 0) return;
  const extent = boardExtent(board);
  ctx.save();
  roundRect(ctx, extent, 30);
  ctx.fillStyle = COLORS.plate;
  ctx.fill();
  ctx.restore();

  // Sockets under every node, and a faint mark on every empty cell.
  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      const x = cellX(col, board.cols);
      const y = cellY(row, board.rows);
      const occupied = board.nodes.some((n) => n.col === col && n.row === row);
      ctx.save();
      if (occupied) {
        ctx.beginPath();
        ctx.arc(x, y, 29, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.socket;
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(140, 160, 230, 0.12)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x, y + 6);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  const complete = new Map<Channel, boolean>();
  for (const beam of s.beams)
    complete.set(beam.channel, isBeamComplete(board, beam));
  for (const beam of s.beams)
    drawBeam(ctx, s, beam, complete.get(beam.channel) ?? false);

  // The live trace reaching toward the pointer.
  const hover = interactive
    ? nodeUnder(board, s.pointer.x, s.pointer.y)
    : undefined;
  if (interactive && s.tracing !== null && s.pointer.down) {
    const cells = beamOf(s.beams, s.tracing.channel).cells;
    const live = cells[cells.length - 1];
    if (live !== undefined) {
      const lx = cellX(live.col, board.cols);
      const ly = cellY(live.row, board.rows);
      const reach = Math.min(
        1,
        (NODE_HIT_R * 2.2) /
          Math.max(1, Math.hypot(s.pointer.x - lx, s.pointer.y - ly)),
      );
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = withAlpha(CHANNEL_HUES[s.tracing.channel], 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(
        lx + (s.pointer.x - lx) * reach,
        ly + (s.pointer.y - ly) * reach,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  for (const node of board.nodes) {
    const x = cellX(node.col, board.cols);
    const y = cellY(node.row, board.rows);
    if (node.kind === "crystal") {
      drawCrystal(ctx, x, y, 25, node.charges ?? 0, spentAt(s.beams, node));
    } else if (node.channel !== null) {
      const lit = segmentsAt(s.beams, node) > 0;
      if (node.kind === "emitter")
        drawEmitter(ctx, node.channel, x, y, FORM_R, lit);
      else drawLens(ctx, node.channel, x, y, FORM_R, lit);
    }
  }

  // The node under the pointer: a ring, in the trace's hue where a move would take.
  if (hover !== undefined && s.pointer.device !== "touch") {
    const x = cellX(hover.col, board.cols);
    const y = cellY(hover.row, board.rows);
    let color = "rgba(255, 255, 255, 0.35)";
    if (s.tracing !== null) {
      const cells = beamOf(s.beams, s.tracing.channel).cells;
      const live = cells[cells.length - 1];
      if (
        live !== undefined &&
        canExtend(board, s.beams, s.tracing.channel, live, hover)
      ) {
        color = CHANNEL_HUES[s.tracing.channel];
      }
    }
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 29, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Per-channel progress, on each channel's own hue and silhouette. */
function drawChannelProgress(ctx: Ctx, s: State): void {
  const channels = channelsPresent(s.board);
  text(ctx, "CHANNELS", 1000, 168, { size: 14, color: COLORS.dim, spacing: 3 });
  channels.forEach((channel, i) => {
    const y = 210 + i * 64;
    const beam = beamOf(s.beams, channel);
    const done = isBeamComplete(s.board, beam);
    const hue = CHANNEL_HUES[channel];
    const lenses = s.board.nodes.filter(
      (n) => n.kind === "lens" && n.channel === channel,
    );
    const threaded = lenses.filter((n) => segmentsAt([beam], n) === 2).length;
    if (done) drawLens(ctx, channel, 1020, y, 17, true);
    else {
      ctx.save();
      silhouette(ctx, channel, 1020, y, 17);
      ctx.strokeStyle = hue;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }
    text(ctx, done ? "LIT" : "OPEN", 1052, y - 2, {
      size: 20,
      weight: 800,
      color: done ? hue : COLORS.ink,
      spacing: 3,
    });
    text(ctx, `${threaded} / ${lenses.length} LENSES`, 1052, y + 20, {
      size: 13,
      weight: 600,
      color: COLORS.dim,
      spacing: 1,
    });
  });
}

/** Cascade's readouts: each value drawn just beside its label. */
function drawCascadeReadouts(ctx: Ctx, s: State, x: number, y: number): void {
  const label = {
    size: 15,
    weight: 700,
    color: COLORS.dim,
    spacing: 3,
  } as const;
  const value = { size: 30, weight: 800, color: COLORS.ink } as const;
  [
    [HUD_SOLVED_LABEL, String(s.solvedCount)],
    [HUD_TIER_LABEL, String(s.tier)],
  ].forEach(([name, figure], i) => {
    const by = y + i * 48;
    text(ctx, name, x, by, label);
    text(ctx, figure, x + textWidth(ctx, name, label) + 16, by + 2, value);
  });
}

function boardHeading(ctx: Ctx, s: State): void {
  if (s.mode === "campaign") {
    const set = SET_LABELS[Math.floor(s.boardIndex / SET_SIZE)] ?? "";
    heading(
      ctx,
      `BOARD ${s.boardIndex + 1}`,
      `${set}  ·  ${s.board.cols} × ${s.board.rows}`,
    );
  } else {
    heading(
      ctx,
      "CASCADE",
      `TIER ${s.tier}  ·  ${s.board.cols} × ${s.board.rows}`,
    );
  }
}

function drawPlaying(ctx: Ctx, s: State): void {
  drawBoard(ctx, s, true);
  boardHeading(ctx, s);
  drawButton(ctx, BACK_BOX, BACK_LABEL, {
    hovered: hovering(s, BACK_BOX) || pressedOn(s, "back"),
  });
  drawButton(ctx, CLEAR_BOX, CLEAR_LABEL, {
    hovered: hovering(s, CLEAR_BOX) || pressedOn(s, "clear"),
    key: "R",
  });
  drawChannelProgress(ctx, s);
  if (s.mode === "cascade") drawCascadeReadouts(ctx, s, 1000, 470);
  footer(
    ctx,
    "PRESS AN EMITTER AND DRAG  ·  R CLEARS  ·  ESC LEAVES THE BOARD",
  );
}

// ---- solved and complete --------------------------------------------------

function drawSolved(ctx: Ctx, s: State): void {
  drawBoard(ctx, s, false);
  boardHeading(ctx, s);
  ctx.save();
  roundRect(ctx, SOLVED_PANEL, 20);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = withAlpha(COLORS.solved, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  const cx = SOLVED_PANEL.x + SOLVED_PANEL.w / 2;
  const title =
    s.mode === "cascade" ? SOLVED_TITLE_TEXT : `BOARD ${s.boardIndex + 1}`;
  text(ctx, title, cx, 190, {
    size: 26,
    weight: 800,
    align: "center",
    spacing: 3,
  });
  text(ctx, s.mode === "cascade" ? "THE LIGHT HOLDS" : "SOLVED", cx, 222, {
    size: 16,
    weight: 700,
    color: COLORS.solved,
    align: "center",
    spacing: 5,
  });
  if (s.mode === "cascade") {
    drawCascadeReadouts(ctx, s, SOLVED_PANEL.x + 40, 270);
  } else {
    text(
      ctx,
      `${s.solvedBoards.length} OF ${CAMPAIGN_LENGTH} SOLVED`,
      cx,
      290,
      {
        size: 15,
        weight: 600,
        color: COLORS.dim,
        align: "center",
        spacing: 2,
      },
    );
  }
  drawMenu(ctx, s, COLORS.solved, 19);
  footer(ctx, "ARROWS CHOOSE  ·  ENTER TAKES");
}

function drawComplete(ctx: Ctx, s: State): void {
  ctx.save();
  ctx.lineCap = "round";
  CHANNELS.forEach((channel, i) => {
    for (let k = 0; k < 6; k += 1) {
      const a = s.simTime * 0.15 + (k * Math.PI) / 3 + (i * Math.PI) / 9;
      ctx.strokeStyle = withAlpha(CHANNEL_HUES[channel], 0.16);
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(640 + Math.cos(a) * 140, 170 + Math.sin(a) * 140);
      ctx.lineTo(640 + Math.cos(a) * 900, 170 + Math.sin(a) * 900);
      ctx.stroke();
    }
  });
  ctx.restore();
  text(ctx, "BENCH COMPLETE", 640, 200, {
    size: 64,
    weight: 800,
    align: "center",
    spacing: 10,
  });
  text(ctx, `ALL ${CAMPAIGN_LENGTH} BOARDS SOLVED`, 640, 256, {
    size: 22,
    weight: 700,
    color: COLORS.solved,
    align: "center",
    spacing: 6,
  });
  text(ctx, "Every channel lit. Every crystal spent.", 640, 310, {
    size: 18,
    weight: 500,
    color: COLORS.dim,
    align: "center",
  });
  drawMenu(ctx, s, COLORS.solved);
  footer(ctx, "ARROWS CHOOSE  ·  ENTER TAKES");
}
