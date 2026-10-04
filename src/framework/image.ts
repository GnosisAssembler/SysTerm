import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import type { Buffer as CellBuffer } from "./buffer.js";
import type { CellStyle, Rect } from "./types.js";
import { clamp, hexToRgb, rgbToHex } from "./util.js";

export interface Raster {
  width: number;
  height: number;
  data: Buffer;
}

const cache = new Map<string, { token: unknown; raster: Raster }>();

export function decodePng(data: Buffer): Raster {
  const png = PNG.sync.read(data);
  return { width: png.width, height: png.height, data: png.data };
}

export function loadRaster(id: string, props: Record<string, unknown>): Raster | null {
  const inline = props.data;
  if (Buffer.isBuffer(inline)) {
    const hit = cache.get(id);
    if (hit && hit.token === inline) return hit.raster;
    try {
      const raster = decodePng(inline);
      cache.set(id, { token: inline, raster });
      return raster;
    } catch {
      return null;
    }
  }
  if (typeof props.path === "string") {
    try {
      const file = readFileSync(props.path);
      const hit = cache.get(id);
      if (hit && hit.token === props.path && hit.raster.data.length === file.length) return hit.raster;
      const raster = decodePng(file);
      cache.set(id, { token: props.path, raster });
      return raster;
    } catch {
      return null;
    }
  }
  return null;
}

export function paintRaster(buffer: CellBuffer, rect: Rect, raster: Raster, background: string): void {
  if (rect.width <= 0 || rect.height <= 0 || raster.width <= 0 || raster.height <= 0) return;
  const destW = rect.width;
  const destH = rect.height * 2;
  const bg = hexToRgb(background);
  for (let cy = 0; cy < rect.height; cy += 1) {
    for (let cx = 0; cx < rect.width; cx += 1) {
      const top = sample(raster, cx, cy * 2, destW, destH, bg);
      const bottom = sample(raster, cx, cy * 2 + 1, destW, destH, bg);
      const style: CellStyle = { fg: rgbToHex(top.r, top.g, top.b), bg: rgbToHex(bottom.r, bottom.g, bottom.b), bold: false };
      buffer.put(rect.x + cx, rect.y + cy, "▀", style);
    }
  }
}

function sample(
  raster: Raster,
  px: number,
  py: number,
  destW: number,
  destH: number,
  background: { r: number; g: number; b: number },
): { r: number; g: number; b: number } {
  const sx = clamp(Math.floor(((px + 0.5) / destW) * raster.width), 0, raster.width - 1);
  const sy = clamp(Math.floor(((py + 0.5) / destH) * raster.height), 0, raster.height - 1);
  const index = (raster.width * sy + sx) * 4;
  const r = raster.data[index] ?? 0;
  const g = raster.data[index + 1] ?? 0;
  const b = raster.data[index + 2] ?? 0;
  const a = raster.data[index + 3] ?? 255;
  const t = a / 255;
  return {
    r: Math.round(r * t + background.r * (1 - t)),
    g: Math.round(g * t + background.g * (1 - t)),
    b: Math.round(b * t + background.b * (1 - t)),
  };
}
