import { sgr } from "./color.js";
import type { CellStyle, ColorMode, Rect } from "./types.js";
import { graphemes, widthOf } from "./util.js";

export interface Cell {
  ch: string;
  fg: string;
  bg: string;
  bold: boolean;
  width: number;
}

function blank(style: CellStyle): Cell {
  return { ch: " ", fg: style.fg, bg: style.bg, bold: false, width: 1 };
}

export class Buffer {
  readonly cells: Cell[][];
  private clips: Rect[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly base: CellStyle,
  ) {
    this.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => blank(base)));
  }

  clear(): void {
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) this.cells[y][x] = blank(this.base);
    }
  }

  get(x: number, y: number): Cell | undefined {
    return this.cells[y]?.[x];
  }

  clip(rect: Rect): void {
    this.clips.push(rect);
  }

  unclip(): void {
    this.clips.pop();
  }

  private hidden(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return true;
    return this.clips.some((rect) => x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height);
  }

  fillRect(rect: Rect, style: CellStyle, ch = " "): void {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        if (this.hidden(x, y)) continue;
        this.cells[y][x] = { ch, fg: style.fg, bg: style.bg, bold: style.bold, width: 1 };
      }
    }
  }

  put(x: number, y: number, grapheme: string, style: CellStyle): void {
    if (this.hidden(x, y) || !grapheme) return;
    const glyphWidth = Math.min(2, Math.max(1, widthOf(grapheme)));
    if (glyphWidth === 2 && this.hidden(x + 1, y)) return;
    const row = this.cells[y];
    if (!row) return;
    if (x > 0 && row[x - 1]?.width === 2) row[x - 1] = blank(this.base);
    if (row[x]?.width === 2 && row[x + 1]) row[x + 1] = blank(this.base);
    row[x] = { ch: grapheme, fg: style.fg, bg: style.bg, bold: style.bold, width: glyphWidth };
    if (glyphWidth === 2 && row[x + 1]) {
      row[x + 1] = { ch: "", fg: style.fg, bg: style.bg, bold: false, width: 0 };
    }
  }

  putText(x: number, y: number, text: string, style: CellStyle, maxWidth = this.cols - x): number {
    let cursor = x;
    let used = 0;
    for (const glyph of graphemes(text)) {
      const glyphWidth = Math.max(1, widthOf(glyph));
      if (used + glyphWidth > maxWidth) break;
      this.put(cursor, y, glyph, style);
      cursor += glyphWidth;
      used += glyphWidth;
    }
    return cursor;
  }

  clone(): Buffer {
    const copy = new Buffer(this.cols, this.rows, this.base);
    for (let y = 0; y < this.rows; y += 1) {
      for (let x = 0; x < this.cols; x += 1) copy.cells[y][x] = { ...this.cells[y][x] };
    }
    return copy;
  }

  toString(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.rows; y += 1) {
      let line = "";
      for (let x = 0; x < this.cols; x += 1) {
        const cell = this.cells[y][x];
        if (cell.width === 0) continue;
        line += cell.ch || " ";
      }
      lines.push(line.replace(/\s+$/, ""));
    }
    return lines.join("\n");
  }

  diff(previous: Buffer | null, mode: ColorMode): string {
    if (!previous || previous.cols !== this.cols || previous.rows !== this.rows) return this.redraw(mode);
    let out = "";
    for (let y = 0; y < this.rows; y += 1) {
      let x = 0;
      while (x < this.cols) {
        const cell = this.cells[y][x];
        if (cell.width === 0) {
          x += 1;
          continue;
        }
        if (sameCell(cell, previous.cells[y][x])) {
          x += cell.width || 1;
          continue;
        }
        const start = x;
        let text = "";
        while (x < this.cols) {
          const current = this.cells[y][x];
          if (current.width === 0) {
            x += 1;
            continue;
          }
          if (!sameStyle(current, cell) || sameCell(current, previous.cells[y][x])) break;
          text += current.ch;
          x += current.width || 1;
        }
        out += `\u001b[${y + 1};${start + 1}H${sgr(cell, mode)}${text}`;
      }
    }
    return out ? `${out}\u001b[0m` : "";
  }

  private redraw(mode: ColorMode): string {
    let out = "\u001b[2J\u001b[H";
    for (let y = 0; y < this.rows; y += 1) {
      out += `\u001b[${y + 1};1H`;
      let x = 0;
      let style: CellStyle | null = null;
      while (x < this.cols) {
        const cell = this.cells[y][x];
        if (cell.width === 0) {
          x += 1;
          continue;
        }
        if (!style || !sameStyle(cell, style)) {
          out += sgr(cell, mode);
          style = cell;
        }
        out += cell.ch;
        x += cell.width || 1;
      }
    }
    return `${out}\u001b[0m`;
  }
}

function sameStyle(a: Cell, b: CellStyle): boolean {
  return a.fg === b.fg && a.bg === b.bg && a.bold === b.bold;
}

function sameCell(a: Cell, b: Cell | undefined): boolean {
  if (!b) return false;
  return a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.width === b.width;
}
