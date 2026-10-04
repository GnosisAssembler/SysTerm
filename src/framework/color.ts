import type { CellStyle, ColorMode } from "./types.js";
import { hexToRgb } from "./util.js";

const ANSI16: Array<[number, number, number]> = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

function nearest16(r: number, g: number, b: number): number {
  let best = 0;
  let score = Number.POSITIVE_INFINITY;
  ANSI16.forEach((color, index) => {
    const distance = (color[0] - r) ** 2 + (color[1] - g) ** 2 + (color[2] - b) ** 2;
    if (distance < score) {
      score = distance;
      best = index;
    }
  });
  return best;
}

function rgbTo256(r: number, g: number, b: number): number {
  if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 24);
  }
  const quant = (channel: number) => Math.round((channel / 255) * 5);
  return 16 + 36 * quant(r) + 6 * quant(g) + quant(b);
}

function colorParam(hex: string, mode: ColorMode, background: boolean): string {
  const { r, g, b } = hexToRgb(hex);
  if (mode === "truecolor") return `;${background ? 48 : 38};2;${r};${g};${b}`;
  if (mode === "256") return `;${background ? 48 : 38};5;${rgbTo256(r, g, b)}`;
  const index = nearest16(r, g, b);
  if (background) return `;${index < 8 ? 40 + index : 100 + (index - 8)}`;
  return `;${index < 8 ? 30 + index : 90 + (index - 8)}`;
}

export function sgr(style: CellStyle, mode: ColorMode): string {
  const bold = style.bold ? ";1" : "";
  return `\u001b[0${bold}${colorParam(style.fg, mode, false)}${colorParam(style.bg, mode, true)}m`;
}
