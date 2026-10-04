import stringWidth from "string-width";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function graphemes(text: string): string[] {
  return [...segmenter.segment(text)].map((part) => part.segment);
}

export function widthOf(text: string): number {
  return stringWidth(text);
}

export function firstGrapheme(text: string): string {
  for (const part of segmenter.segment(text)) return part.segment;
  return "";
}

export function truncate(text: string, width: number): string {
  if (width <= 0) return "";
  let used = 0;
  let out = "";
  for (const glyph of graphemes(text)) {
    const glyphWidth = widthOf(glyph);
    if (used + glyphWidth > width) break;
    out += glyph;
    used += glyphWidth;
  }
  return out;
}

export function pad(text: string, width: number, align: "left" | "right" = "left"): string {
  const clipped = truncate(text, width);
  const gap = Math.max(0, width - widthOf(clipped));
  const spaces = " ".repeat(gap);
  return align === "right" ? spaces + clipped : clipped + spaces;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return { r: 255, g: 255, b: 255 };
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}
