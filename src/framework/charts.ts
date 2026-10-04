import { clamp } from "./util.js";

const SPARK = "▁▂▃▄▅▆▇█";

// Braille dots are 2 columns by 4 rows. Bits follow the Unicode order.
const DOTS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

export function sparklineChars(values: number[], width: number, min?: number, max?: number): string {
  if (width <= 0) return "";
  const slice = values.slice(-width);
  const pad = " ".repeat(Math.max(0, width - slice.length));
  if (!slice.length) return pad;
  const lo = min ?? Math.min(...slice);
  const hi = max ?? Math.max(...slice);
  const span = hi - lo || 1;
  const body = slice
    .map((value) => {
      const t = clamp((value - lo) / span, 0, 1);
      return SPARK[clamp(Math.round(t * 7), 0, 7)];
    })
    .join("");
  return pad + body;
}

export function resample(values: number[], count: number): number[] {
  if (count <= 0 || values.length === 0) return [];
  if (values.length === 1) return Array.from({ length: count }, () => values[0] ?? 0);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const pos = (i / (count - 1)) * (values.length - 1);
    const left = Math.floor(pos);
    const right = Math.min(values.length - 1, left + 1);
    const mix = pos - left;
    const a = values[left] ?? 0;
    const b = values[right] ?? a;
    out.push(a * (1 - mix) + b * mix);
  }
  return out;
}

export function brailleChart(values: number[], cols: number, rows: number, min?: number, max?: number): string[] {
  if (cols <= 0 || rows <= 0) return [];
  const dotCols = cols * 2;
  const dotRows = rows * 4;
  const samples = resample(values, dotCols);
  const bits = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  if (samples.length) {
    const lo = min ?? Math.min(...samples);
    const hi = max ?? Math.max(...samples);
    const span = hi - lo || 1;
    const points = samples.map((value, x) => {
      const t = clamp((value - lo) / span, 0, 1);
      return { x, y: clamp(Math.round((1 - t) * (dotRows - 1)), 0, dotRows - 1) };
    });
    const set = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= dotCols || y >= dotRows) return;
      const col = Math.floor(x / 2);
      const row = Math.floor(y / 4);
      bits[row][col] |= DOTS[y % 4][x % 2];
    };
    if (points.length === 1) set(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      if (from && to) plotLine(set, from.x, from.y, to.x, to.y);
    }
  }
  return bits.map((row) => row.map((value) => String.fromCodePoint(0x2800 + value)).join(""));
}

function plotLine(set: (x: number, y: number) => void, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (let guard = 0; guard < dx + dy + 8; guard += 1) {
    set(x, y);
    if (x === x1 && y === y1) break;
    const doubled = 2 * err;
    if (doubled > -dy) {
      err -= dy;
      x += sx;
    }
    if (doubled < dx) {
      err += dx;
      y += sy;
    }
  }
}

export function gaugeBlocks(value: number, max: number, width: number): { ratio: number; filled: number } {
  const ratio = max <= 0 ? 0 : clamp(value / max, 0, 1);
  return { ratio, filled: Math.round(ratio * Math.max(0, width)) };
}

export function heatGlyph(t: number): string {
  return " ░▒▓█"[clamp(Math.round(clamp(t, 0, 1) * 4), 0, 4)] ?? " ";
}

export function loadColor(ratio: number, accent: string, warn: string, hot: string): string {
  if (ratio >= 0.9) return hot;
  if (ratio >= 0.7) return warn;
  return accent;
}
