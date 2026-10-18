// Drawing primitives shared by every screen: the palette, type, the channel
// silhouettes, the crystal, and the bench's buttons. Everything is drawn in the
// stage's logical units through the context the engine hands `render`.

import type { Box } from "./board";
import type { Channel } from "./game";

type Ctx = CanvasRenderingContext2D;

/** The bench's palette. Each channel carries one hue, far apart on the wheel. */
export const COLORS = {
  ink: "#eef1fb",
  dim: "#8d96b4",
  faint: "#4a5372",
  plate: "rgba(120, 140, 210, 0.05)",
  socket: "#0c111e",
  line: "rgba(140, 160, 230, 0.16)",
  panel: "rgba(14, 19, 34, 0.92)",
  crystal: "#cfc8ff",
  crystalDeep: "#5b4fa8",
  solved: "#7cf2c4",
  danger: "#ff7a6b",
} as const;

export const CHANNEL_HUES: Readonly<Record<Channel, string>> = {
  triangle: "#ffb547",
  square: "#36d4ff",
  diamond: "#ff5fae",
};

/** The hue with an alpha, from a `#rrggbb` color. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const FAMILY =
  '"Avenir Next", "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

export function font(size: number, weight = 600): string {
  return `${weight} ${size}px ${FAMILY}`;
}

export interface TextStyle {
  readonly size: number;
  readonly weight?: number;
  readonly color?: string;
  readonly align?: CanvasTextAlign;
  readonly baseline?: CanvasTextBaseline;
  /** Extra space between letters, in stage units. */
  readonly spacing?: number;
}

function applyText(ctx: Ctx, style: TextStyle): void {
  ctx.font = font(style.size, style.weight ?? 600);
  ctx.fillStyle = style.color ?? COLORS.ink;
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = style.baseline ?? "alphabetic";
  ctx.letterSpacing = `${style.spacing ?? 0}px`;
}

export function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  style: TextStyle,
): void {
  ctx.save();
  applyText(ctx, style);
  ctx.fillText(value, x, y);
  ctx.restore();
}

export function textWidth(ctx: Ctx, value: string, style: TextStyle): number {
  ctx.save();
  applyText(ctx, style);
  const width = ctx.measureText(value).width;
  ctx.restore();
  return width;
}

/** Breaks `value` into lines no wider than `width`. */
export function wrap(
  ctx: Ctx,
  value: string,
  width: number,
  style: TextStyle,
): string[] {
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && textWidth(ctx, next, style) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

export function roundRect(ctx: Ctx, box: Box, radius: number): void {
  const r = Math.min(radius, box.w / 2, box.h / 2);
  ctx.beginPath();
  ctx.moveTo(box.x + r, box.y);
  ctx.lineTo(box.x + box.w - r, box.y);
  ctx.arcTo(box.x + box.w, box.y, box.x + box.w, box.y + r, r);
  ctx.lineTo(box.x + box.w, box.y + box.h - r);
  ctx.arcTo(box.x + box.w, box.y + box.h, box.x + box.w - r, box.y + box.h, r);
  ctx.lineTo(box.x + r, box.y + box.h);
  ctx.arcTo(box.x, box.y + box.h, box.x, box.y + box.h - r, r);
  ctx.lineTo(box.x, box.y + r);
  ctx.arcTo(box.x, box.y, box.x + r, box.y, r);
  ctx.closePath();
}

/**
 * Traces a channel's silhouette centered on `(cx, cy)` at scale `r`, the
 * radius the form reaches. Every form is balanced to read the same size.
 */
export function silhouette(
  ctx: Ctx,
  channel: Channel,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.beginPath();
  if (channel === "triangle") {
    // Lowered a little so the triangle's visual center sits on the cell's.
    const oy = cy + r * 0.12;
    for (let i = 0; i < 3; i += 1) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
      const px = cx + Math.cos(a) * r;
      const py = oy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  } else if (channel === "square") {
    const h = r * 0.72;
    ctx.rect(cx - h, cy - h, 2 * h, 2 * h);
  } else {
    const h = r * 0.98;
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + h, cy);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx - h, cy);
  }
  ctx.closePath();
}

/** An emitter's form: the channel silhouette, outlined. */
export function drawEmitter(
  ctx: Ctx,
  channel: Channel,
  cx: number,
  cy: number,
  r: number,
  lit: boolean,
): void {
  const hue = CHANNEL_HUES[channel];
  ctx.save();
  silhouette(ctx, channel, cx, cy, r);
  ctx.fillStyle = COLORS.socket;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = withAlpha(hue, lit ? 0.35 : 0.18);
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = lit ? "#ffffff" : hue;
  ctx.lineWidth = lit ? 2 : 3.5;
  if (lit) {
    ctx.stroke();
    ctx.strokeStyle = hue;
    ctx.lineWidth = 3.5;
    silhouette(ctx, channel, cx, cy, r - 3);
  }
  ctx.stroke();
  // The source point the beam leaves from.
  ctx.beginPath();
  ctx.arc(
    cx,
    cy + (channel === "triangle" ? r * 0.12 : 0),
    lit ? 4 : 3,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = lit ? "#ffffff" : hue;
  ctx.fill();
  ctx.restore();
}

/** A lens's form: the channel silhouette, filled. */
export function drawLens(
  ctx: Ctx,
  channel: Channel,
  cx: number,
  cy: number,
  r: number,
  lit: boolean,
): void {
  const hue = CHANNEL_HUES[channel];
  ctx.save();
  silhouette(ctx, channel, cx, cy, r);
  ctx.fillStyle = lit ? hue : withAlpha(hue, 0.78);
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = lit ? "#ffffff" : withAlpha(hue, 0.95);
  ctx.lineWidth = lit ? 2.5 : 1.5;
  ctx.stroke();
  if (lit) {
    // A threaded lens carries a bright core where the beam passes.
    const gy = cy + (channel === "triangle" ? r * 0.15 : 0);
    const glow = ctx.createRadialGradient(cx, gy, 0, cx, gy, r * 0.55);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.7)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    silhouette(ctx, channel, cx, cy, r);
    ctx.fillStyle = glow;
    ctx.fill();
  }
  ctx.restore();
}

/** The positions of a crystal's charge pips, left to right. */
function pipOffsets(charges: number): number[] {
  if (charges <= 1) return [0];
  if (charges === 2) return [-8, 8];
  return [-13, 0, 13];
}

/**
 * A crystal: a hexagon, unlike any channel form, carrying one pip per charge.
 * A spent charge's pip burns white; an unspent one is a hollow ring.
 */
export function drawCrystal(
  ctx: Ctx,
  cx: number,
  cy: number,
  r: number,
  charges: number,
  spent: number,
): void {
  const full = spent === charges;
  const over = spent > charges;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const body = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  body.addColorStop(0, full ? "#3c3a6e" : "#262248");
  body.addColorStop(1, full ? "#1c2a3e" : "#14122a");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.strokeStyle = over ? COLORS.danger : full ? "#ffffff" : COLORS.crystal;
  ctx.lineWidth = full ? 3 : 2.5;
  ctx.stroke();
  // Facets.
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy - r * 0.62);
  ctx.lineTo(cx, cy - r * 0.32);
  ctx.lineTo(cx + r * 0.5, cy - r * 0.62);
  ctx.moveTo(cx, cy - r * 0.32);
  ctx.lineTo(cx, cy - r * 0.86);
  ctx.strokeStyle = withAlpha(COLORS.crystal, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  pipOffsets(charges).forEach((dx, i) => {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + 5, 5, 0, Math.PI * 2);
    if (i < spent) {
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    } else {
      ctx.strokeStyle = COLORS.crystal;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });
  ctx.restore();
}

export interface ButtonLook {
  readonly highlighted?: boolean;
  readonly hovered?: boolean;
  readonly size?: number;
  readonly color?: string;
  /** A key named inside the button, at its right edge. */
  readonly key?: string;
}

/** A labelled control filling `box`. */
export function drawButton(
  ctx: Ctx,
  box: Box,
  label: string,
  look: ButtonLook = {},
): void {
  const accent = look.color ?? COLORS.ink;
  ctx.save();
  roundRect(ctx, box, 14);
  ctx.fillStyle = look.highlighted
    ? withAlpha(accent.startsWith("#") ? accent : "#eef1fb", 0.16)
    : look.hovered
      ? "rgba(255, 255, 255, 0.07)"
      : "rgba(255, 255, 255, 0.025)";
  ctx.fill();
  ctx.strokeStyle = look.highlighted
    ? accent
    : look.hovered
      ? COLORS.dim
      : COLORS.faint;
  ctx.lineWidth = look.highlighted ? 3 : 1.5;
  ctx.stroke();
  const size = look.size ?? 24;
  const cy = box.y + box.h / 2;
  let cx = box.x + box.w / 2;
  if (look.key !== undefined) {
    const cap: Box = { x: box.x + box.w - 44, y: cy - 16, w: 32, h: 32 };
    roundRect(ctx, cap, 6);
    ctx.strokeStyle = COLORS.dim;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    text(ctx, look.key, cap.x + cap.w / 2, cy + 1, {
      size: 16,
      weight: 700,
      color: COLORS.dim,
      align: "center",
      baseline: "middle",
    });
    cx = box.x + (box.w - 44) / 2 + 4;
  }
  if (look.highlighted) {
    // A pointer mark beside the highlighted item.
    ctx.beginPath();
    ctx.moveTo(box.x + 18, cy - 8);
    ctx.lineTo(box.x + 28, cy);
    ctx.lineTo(box.x + 18, cy + 8);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
  }
  if (look.highlighted) cx += 10;
  text(ctx, label, cx, cy + 1, {
    size,
    weight: 700,
    color: look.highlighted || look.hovered ? COLORS.ink : "#c3c9dd",
    align: "center",
    baseline: "middle",
    spacing: 2,
  });
  ctx.restore();
}
