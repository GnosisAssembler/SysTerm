import { graphemes, widthOf } from "./util.js";

export interface Span {
  text: string;
  bold: boolean;
  fg?: string;
}

interface StyleFrame {
  bold: boolean;
  fg?: string;
}

const TAG = /\{(\/b|b|\/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{6}|\/)\}/g;

export function parseMarkup(input: string): Span[] {
  const stack: StyleFrame[] = [{ bold: false }];
  const spans: Span[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const top = stack[stack.length - 1] ?? { bold: false };
    spans.push({ text: buffer, bold: top.bold, fg: top.fg });
    buffer = "";
  };

  TAG.lastIndex = 0;
  let cursor = 0;
  for (const match of input.matchAll(TAG)) {
    const index = match.index ?? 0;
    buffer += input.slice(cursor, index);
    flush();
    const tag = match[1] ?? "";
    const top = stack[stack.length - 1] ?? { bold: false };
    if (tag === "b") stack.push({ ...top, bold: true });
    else if (tag.startsWith("#")) stack.push({ ...top, fg: tag.toLowerCase() });
    else if (stack.length > 1) stack.pop();
    cursor = index + match[0].length;
  }
  buffer += input.slice(cursor);
  flush();
  return spans;
}

export function wrapPlain(text: string, width: number): string[] {
  if (width <= 0) return [];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    let lineWidth = 0;
    for (const glyph of graphemes(paragraph)) {
      const glyphWidth = Math.max(0, widthOf(glyph));
      if (glyphWidth > width) continue;
      if (lineWidth + glyphWidth > width && line) {
        lines.push(line);
        line = "";
        lineWidth = 0;
      }
      line += glyph;
      lineWidth += glyphWidth;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

export function wrapSpans(spans: Span[], width: number): Span[][] {
  if (width <= 0) return [];
  const lines: Span[][] = [];
  let line: Span[] = [];
  let lineWidth = 0;
  const pushLine = () => {
    lines.push(line);
    line = [];
    lineWidth = 0;
  };

  const append = (text: string, bold: boolean, fg?: string) => {
    if (!text) return;
    const last = line[line.length - 1];
    if (last && last.bold === bold && last.fg === fg) last.text += text;
    else line.push({ text, bold, fg });
  };

  for (const span of spans) {
    const parts = span.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) pushLine();
      let chunk = "";
      let chunkWidth = 0;
      const commit = () => {
        append(chunk, span.bold, span.fg);
        chunk = "";
        chunkWidth = 0;
      };
      for (const glyph of graphemes(part)) {
        const glyphWidth = Math.max(0, widthOf(glyph));
        if (glyphWidth > width) continue;
        if (lineWidth + chunkWidth + glyphWidth > width && (lineWidth > 0 || chunk)) {
          commit();
          pushLine();
        }
        chunk += glyph;
        chunkWidth += glyphWidth;
      }
      commit();
    });
  }
  if (line.length || lines.length === 0) lines.push(line);
  return lines;
}
