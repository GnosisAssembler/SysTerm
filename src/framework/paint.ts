import type { Buffer } from "./buffer.js";
import { brailleChart, gaugeBlocks, heatGlyph, loadColor, sparklineChars } from "./charts.js";
import { fitFiglet } from "./figlet.js";
import { loadRaster, paintRaster } from "./image.js";
import type { Laid } from "./layout.js";
import { parseMarkup, wrapSpans } from "./text.js";
import type { CellStyle, KeyEvent, Rect, Theme } from "./types.js";
import type { UIState, WidgetRuntime } from "./ui-state.js";
import { clamp, pad, truncate, widthOf } from "./util.js";

interface Hit {
  id: string;
  rect: Rect;
  onKey?: (key: KeyEvent) => boolean;
  onClick?: (x: number, y: number) => void;
  onWheel?: (delta: number) => void;
}

export interface PaintContext {
  theme: Theme;
  ui: UIState;
  hits: Hit[];
  bg: string;
}

export function paintLaid(laid: Laid, buffer: Buffer, ctx: PaintContext): void {
  paintNode(laid, buffer, ctx);
  for (const modal of laid.modals) paintNode(modal, buffer, ctx);
}

function paintNode(laid: Laid, buffer: Buffer, ctx: PaintContext): void {
  const previous = ctx.bg;
  const panelLike = laid.vnode.type === "panel" || laid.vnode.type === "modal";
  if (panelLike) ctx.bg = ctx.theme.panel;
  paintSelf(laid, buffer, ctx);
  if (laid.vnode.type === "scroll") {
    buffer.clip(laid.content);
    for (const child of laid.children) paintNode(child, buffer, ctx);
    buffer.unclip();
  } else {
    for (const child of laid.children) paintNode(child, buffer, ctx);
  }
  ctx.bg = previous;
}

function paintSelf(laid: Laid, buffer: Buffer, ctx: PaintContext): void {
  const { vnode, rect, content } = laid;
  const focused = ctx.ui.focusedKey === laid.id;
  switch (vnode.type) {
    case "panel":
    case "modal":
      drawPanel(buffer, rect, ctx, stringProp(vnode.props.title), focused);
      if (vnode.type === "modal") {
        register(ctx, laid, {
          onKey: (key) => {
            if (key.name === "escape") {
              call(vnode.props.onClose);
              return true;
            }
            return false;
          },
        });
      }
      return;
    case "scroll":
      buffer.fillRect(content, { fg: ctx.theme.fg, bg: ctx.bg, bold: false });
      register(ctx, laid, {
        onKey: (key) => scrollKey(ctx.ui.runtime(laid.id), key),
        onWheel: (delta) => {
          const runtime = ctx.ui.runtime(laid.id);
          runtime.scroll = Math.max(0, runtime.scroll + delta * 3);
        },
      });
      return;
    case "text":
      paintText(buffer, content, ctx, stringProp(vnode.props.content), stringProp(vnode.props.tone), vnode.props.nowrap === true);
      return;
    case "banner":
      paintLines(buffer, content, fitFiglet(stringProp(vnode.props.label), content.width).split("\n"), style(ctx, ctx.theme.accent, true), "center");
      return;
    case "ascii":
      paintLines(buffer, content, stringProp(vnode.props.art).split("\n"), style(ctx, ctx.theme.fg, false), "left");
      return;
    case "sparkline":
      paintSpark(buffer, content, ctx, vnode.props);
      return;
    case "lineChart":
      paintLineChart(buffer, content, ctx, vnode.props);
      return;
    case "barChart":
      paintBars(buffer, content, ctx, vnode.props);
      return;
    case "gauge":
      paintGauge(buffer, content, ctx, vnode.props);
      return;
    case "heatmap":
      paintHeat(buffer, content, ctx, vnode.props);
      return;
    case "progress":
      paintProgress(buffer, content, ctx, vnode.props);
      return;
    case "tabs":
      paintTabs(buffer, laid, ctx);
      return;
    case "select":
      paintSelect(buffer, laid, ctx);
      return;
    case "textInput":
      paintInput(buffer, laid, ctx);
      return;
    case "checkbox":
      paintCheckbox(buffer, laid, ctx);
      return;
    case "button":
      paintButton(buffer, laid, ctx);
      return;
    case "table":
      paintTable(buffer, laid, ctx);
      return;
    case "image":
      paintImage(buffer, laid, ctx);
      return;
    default:
      return;
  }
}

function paintText(buffer: Buffer, rect: Rect, ctx: PaintContext, content: string, tone: string, nowrap = false): void {
  const fg = toneColor(ctx.theme, tone);
  const wrapped = wrapSpans(parseMarkup(content), Math.max(1, rect.width));
  const lines = nowrap ? wrapped.slice(0, 1) : wrapped;
  lines.forEach((line, index) => {
    if (index >= rect.height) return;
    let x = rect.x;
    for (const span of line) {
      const spanStyle = style(ctx, span.fg ?? fg, span.bold);
      x = buffer.putText(x, rect.y + index, span.text, spanStyle, rect.x + rect.width - x);
    }
  });
}

function paintLines(buffer: Buffer, rect: Rect, lines: string[], ink: CellStyle, align: "left" | "center"): void {
  lines.forEach((line, index) => {
    if (index >= rect.height || rect.width <= 0) return;
    const clipped = truncate(line, rect.width);
    const gap = Math.max(0, rect.width - widthOf(clipped));
    const x = rect.x + (align === "center" ? Math.floor(gap / 2) : 0);
    buffer.putText(x, rect.y + index, clipped, ink, rect.width);
  });
}

function paintSpark(buffer: Buffer, rect: Rect, ctx: PaintContext, props: Record<string, unknown>): void {
  const data = numbers(props.data);
  const chars = sparklineChars(data, rect.width, numberMaybe(props.min), numberMaybe(props.max));
  buffer.putText(rect.x, rect.y, chars, style(ctx, ctx.theme.accent, false), rect.width);
}

function paintLineChart(buffer: Buffer, rect: Rect, ctx: PaintContext, props: Record<string, unknown>): void {
  const data = numbers(props.data);
  if (!data.length || rect.width <= 0 || rect.height <= 0) {
    buffer.putText(rect.x, rect.y, "no samples yet", style(ctx, ctx.theme.muted, false), rect.width);
    return;
  }
  const rows = brailleChart(data, rect.width, rect.height, numberMaybe(props.min), numberMaybe(props.max));
  const empty = String.fromCodePoint(0x2800);
  rows.forEach((line, y) => {
    let x = 0;
    for (const glyph of line) {
      const ink = glyph === empty ? ctx.theme.muted : ctx.theme.accent;
      buffer.put(rect.x + x, rect.y + y, glyph, style(ctx, ink, false));
      x += 1;
    }
  });
}

function paintBars(buffer: Buffer, rect: Rect, ctx: PaintContext, props: Record<string, unknown>): void {
  const items = Array.isArray(props.items) ? props.items : [];
  items.forEach((item, index) => {
    if (index >= rect.height || !item || typeof item !== "object") return;
    const record = item as Record<string, unknown>;
    const label = stringProp(record.label);
    const value = numberProp(record.value);
    const max = numberProp(record.max, 100);
    const labelWidth = Math.min(12, Math.max(4, Math.floor(rect.width * 0.28)));
    const valueWidth = 5;
    const barWidth = Math.max(1, rect.width - labelWidth - valueWidth - 2);
    const { ratio, filled } = gaugeBlocks(value, max, barWidth);
    const y = rect.y + index;
    buffer.putText(rect.x, y, pad(label, labelWidth), style(ctx, ctx.theme.fg, false), labelWidth);
    for (let i = 0; i < barWidth; i += 1) {
      const on = i < filled;
      buffer.put(rect.x + labelWidth + 1 + i, y, on ? "█" : "░", style(ctx, on ? loadColor(ratio, ctx.theme.accent, ctx.theme.warn, ctx.theme.hot) : ctx.theme.muted, false));
    }
    buffer.putText(rect.x + labelWidth + barWidth + 2, y, pad(`${Math.round(ratio * 100)}%`, valueWidth, "right"), style(ctx, ctx.theme.muted, false), valueWidth);
  });
}

function paintGauge(buffer: Buffer, rect: Rect, ctx: PaintContext, props: Record<string, unknown>): void {
  const value = numberProp(props.value);
  const max = numberProp(props.max, 100);
  const label = stringProp(props.label, "value");
  const ratio = max <= 0 ? 0 : clamp(value / max, 0, 1);
  const headline = pad(`${label}  ${Math.round(ratio * 100)}%`, rect.width);
  buffer.putText(rect.x, rect.y, headline, style(ctx, loadColor(ratio, ctx.theme.accent, ctx.theme.warn, ctx.theme.hot), true), rect.width);
  if (rect.height < 2) return;
  const { filled } = gaugeBlocks(value, max, rect.width);
  for (let i = 0; i < rect.width; i += 1) {
    const on = i < filled;
    buffer.put(rect.x + i, rect.y + 1, on ? "█" : "░", style(ctx, on ? loadColor(ratio, ctx.theme.accent, ctx.theme.warn, ctx.theme.hot) : ctx.theme.muted, false));
  }
}

function paintProgress(buffer: Buffer, rect: Rect, ctx: PaintContext, props: Record<string, unknown>): void {
  const value = numberProp(props.value);
  const max = numberProp(props.max, 100);
  const label = stringProp(props.label);
  const labelWidth = label ? Math.min(12, widthOf(label) + 1) : 0;
  const barWidth = Math.max(1, rect.width - labelWidth);
  const { ratio, filled } = gaugeBlocks(value, max, barWidth);
  if (labelWidth) buffer.putText(rect.x, rect.y, pad(label, labelWidth), style(ctx, ctx.theme.fg, false), labelWidth);
  for (let i = 0; i < barWidth; i += 1) {
    buffer.put(rect.x + labelWidth + i, rect.y, i < filled ? "█" : "░", style(ctx, i < filled ? loadColor(ratio, ctx.theme.accent, ctx.theme.warn, ctx.theme.hot) : ctx.theme.muted, false));
  }
}

function paintHeat(buffer: Buffer, rect: Rect, ctx: PaintContext, props: Record<string, unknown>): void {
  const values = Array.isArray(props.values) ? props.values : [];
  const flat = values.flatMap((row) => (Array.isArray(row) ? row.filter((value): value is number => typeof value === "number") : []));
  const min = numberMaybe(props.min) ?? (flat.length ? Math.min(...flat) : 0);
  const max = numberMaybe(props.max) ?? (flat.length ? Math.max(...flat) : 1);
  const span = max - min || 1;
  values.forEach((row, y) => {
    if (y >= rect.height || !Array.isArray(row)) return;
    row.forEach((value, x) => {
      if (x >= rect.width || typeof value !== "number") return;
      const t = clamp((value - min) / span, 0, 1);
      buffer.put(rect.x + x, rect.y + y, heatGlyph(t), style(ctx, loadColor(t, ctx.theme.accent, ctx.theme.warn, ctx.theme.hot), false));
    });
  });
}

function paintTabs(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const labels = strings(laid.vnode.props.tabs);
  const runtime = ctx.ui.runtime(laid.id);
  const selected = numberMaybe(laid.vnode.props.selected) ?? runtime.selected;
  const shown = labels.map((label, index) => (index === selected ? `[${label}]` : label));
  const widths = shown.map((label) => widthOf(label) + 2);
  let x = laid.content.x;
  shown.forEach((label, index) => {
    const width = widths[index] ?? 0;
    if (x >= laid.content.x + laid.content.width) return;
    const on = index === selected;
    const text = truncate(`${label}  `, Math.max(0, laid.content.x + laid.content.width - x));
    buffer.putText(x, laid.content.y, text, style(ctx, on ? ctx.theme.accent : ctx.theme.muted, on), width);
    x += width;
  });
  register(ctx, laid, {
    onKey: (key) => {
      if (key.name !== "left" && key.name !== "right" && key.name !== "h" && key.name !== "l") return false;
      const next = clamp(selected + (key.name === "left" || key.name === "h" ? -1 : 1), 0, Math.max(0, labels.length - 1));
      choose(laid, runtime, next, laid.vnode.props.onSelect);
      return true;
    },
    onClick: (localX) => {
      let cursor = 0;
      for (let index = 0; index < labels.length; index += 1) {
        const width = widths[index] ?? 0;
        if (localX >= cursor && localX < cursor + width) {
          choose(laid, runtime, index, laid.vnode.props.onSelect);
          return;
        }
        cursor += width;
      }
    },
  });
}

function paintSelect(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const options = strings(laid.vnode.props.options);
  const runtime = ctx.ui.runtime(laid.id);
  const selected = clamp(numberMaybe(laid.vnode.props.selected) ?? runtime.selected, 0, Math.max(0, options.length - 1));
  const height = Math.max(1, laid.content.height);
  runtime.viewport = height;
  runtime.scroll = clamp(runtime.scroll, 0, Math.max(0, options.length - height));
  if (selected < runtime.scroll) runtime.scroll = selected;
  if (selected >= runtime.scroll + height) runtime.scroll = selected - height + 1;
  const focused = ctx.ui.focusedKey === laid.id;
  for (let row = 0; row < height; row += 1) {
    const index = runtime.scroll + row;
    const label = options[index];
    if (label == null) break;
    const on = index === selected;
    const bg = on ? ctx.theme.selection : ctx.bg;
    buffer.fillRect({ x: laid.content.x, y: laid.content.y + row, width: laid.content.width, height: 1 }, { fg: ctx.theme.fg, bg, bold: false });
    const marker = on ? "▸ " : "  ";
    buffer.putText(laid.content.x, laid.content.y + row, truncate(marker + label, laid.content.width), styleOn(ctx, on ? ctx.theme.accent : ctx.theme.fg, on && focused, bg), laid.content.width);
  }
  register(ctx, laid, {
    onKey: (key) => moveList(key, selected, options.length, height, runtime, laid.vnode.props.onSelect),
    onClick: (_x, y) => {
      const index = runtime.scroll + y;
      if (index >= 0 && index < options.length) choose(laid, runtime, index, laid.vnode.props.onSelect);
    },
    onWheel: (delta) => {
      runtime.scroll = clamp(runtime.scroll + delta, 0, Math.max(0, options.length - height));
    },
  });
}

function paintInput(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const runtime = ctx.ui.runtime(laid.id);
  const value = typeof laid.vnode.props.value === "string" ? laid.vnode.props.value : runtime.text;
  const placeholder = stringProp(laid.vnode.props.placeholder, "type here");
  const focused = ctx.ui.focusedKey === laid.id;
  runtime.cursor = clamp(runtime.cursor, 0, value.length);
  const width = Math.max(1, laid.content.width);
  if (runtime.cursor < runtime.scroll) runtime.scroll = runtime.cursor;
  if (runtime.cursor > runtime.scroll + width - 1) runtime.scroll = runtime.cursor - width + 1;
  const windowText = value.slice(runtime.scroll, runtime.scroll + width);
  const shown = value ? windowText : placeholder;
  const ink = value ? ctx.theme.fg : ctx.theme.muted;
  const bg = focused ? ctx.theme.selection : ctx.bg;
  buffer.fillRect(laid.content, { fg: ink, bg, bold: false });
  buffer.putText(laid.content.x, laid.content.y, pad(shown, width), { fg: ink, bg, bold: false }, width);
  if (focused && value) {
    const cursorX = laid.content.x + runtime.cursor - runtime.scroll;
    const glyph = value[runtime.cursor] ?? " ";
    buffer.put(cursorX, laid.content.y, glyph, { fg: ctx.theme.bg, bg: ctx.theme.accent, bold: true });
  }
  register(ctx, laid, {
    onKey: (key) => editInput(key, value, runtime, laid.vnode.props),
    onClick: (x) => {
      runtime.cursor = clamp(runtime.scroll + x, 0, value.length);
    },
  });
}

function paintCheckbox(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const checked = laid.vnode.props.checked === true;
  const focused = ctx.ui.focusedKey === laid.id;
  const mark = checked ? "x" : " ";
  const label = stringProp(laid.vnode.props.label);
  const text = `[${mark}] ${label}`;
  buffer.putText(laid.content.x, laid.content.y, truncate(text, laid.content.width), style(ctx, focused ? ctx.theme.accent : ctx.theme.fg, focused), laid.content.width);
  register(ctx, laid, {
    onKey: (key) => {
      if (key.name !== " " && key.name !== "space" && key.name !== "return") return false;
      const fn = laid.vnode.props.onChange;
      if (typeof fn === "function") fn(!checked);
      return true;
    },
    onClick: () => {
      const fn = laid.vnode.props.onChange;
      if (typeof fn === "function") fn(!checked);
    },
  });
}

function paintButton(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const focused = ctx.ui.focusedKey === laid.id;
  const label = ` ${stringProp(laid.vnode.props.label, "ok")} `;
  const bg = focused ? ctx.theme.accent : ctx.theme.selection;
  const fg = focused ? ctx.theme.bg : ctx.theme.fg;
  buffer.fillRect({ x: laid.content.x, y: laid.content.y, width: Math.min(laid.content.width, widthOf(label)), height: 1 }, { fg, bg, bold: true });
  buffer.putText(laid.content.x, laid.content.y, truncate(label, laid.content.width), { fg, bg, bold: true }, laid.content.width);
  register(ctx, laid, {
    onKey: (key) => {
      if (key.name !== "return" && key.name !== "space") return false;
      call(laid.vnode.props.onPress);
      return true;
    },
    onClick: () => call(laid.vnode.props.onPress),
  });
}

function paintTable(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const columns = Array.isArray(laid.vnode.props.columns) ? laid.vnode.props.columns as Array<Record<string, unknown>> : [];
  const rows = Array.isArray(laid.vnode.props.rows) ? laid.vnode.props.rows as Array<Record<string, unknown>> : [];
  const runtime = ctx.ui.runtime(laid.id);
  const bodyHeight = Math.max(0, laid.content.height - 1);
  runtime.viewport = bodyHeight;
  const selected = clamp(numberMaybe(laid.vnode.props.selected) ?? runtime.selected, 0, Math.max(0, rows.length - 1));
  const maxScroll = Math.max(0, rows.length - bodyHeight);
  runtime.scroll = clamp(runtime.scroll, 0, maxScroll);
  if (rows.length && selected < runtime.scroll) runtime.scroll = selected;
  if (rows.length && selected >= runtime.scroll + bodyHeight) runtime.scroll = selected - bodyHeight + 1;
  const showBar = rows.length > bodyHeight && laid.content.width > 12;
  const width = showBar ? laid.content.width - 2 : laid.content.width;
  const widths = columnWidths(columns, width);
  const header = widths.map((columnWidth, index) => pad(stringProp(columns[index]?.title), columnWidth, columns[index]?.align === "right" ? "right" : "left")).join(" ");
  buffer.putText(laid.content.x, laid.content.y, truncate(header, width), style(ctx, ctx.theme.accent, true), width);
  if (!rows.length) {
    buffer.putText(laid.content.x, laid.content.y + 1, truncate(stringProp(laid.vnode.props.empty, "nothing here"), width), style(ctx, ctx.theme.muted, false), width);
  }
  for (let line = 0; line < bodyHeight; line += 1) {
    const index = runtime.scroll + line;
    const row = rows[index];
    if (!row) break;
    const on = index === selected;
    const bg = on ? ctx.theme.selection : ctx.bg;
    buffer.fillRect({ x: laid.content.x, y: laid.content.y + 1 + line, width: laid.content.width, height: 1 }, { fg: ctx.theme.fg, bg, bold: false });
    const cells = widths.map((columnWidth, columnIndex) => {
      const key = stringProp(columns[columnIndex]?.key);
      const align = columns[columnIndex]?.align === "right" ? "right" : "left";
      return pad(String(row[key] ?? ""), columnWidth, align);
    }).join(" ");
    buffer.putText(laid.content.x, laid.content.y + 1 + line, truncate(cells, width), styleOn(ctx, on ? ctx.theme.fg : ctx.theme.fg, on, bg), width);
  }
  if (showBar) {
    const track = bodyHeight;
    const thumb = Math.max(1, Math.round((track * bodyHeight) / rows.length));
    const pos = Math.round((runtime.scroll / Math.max(1, maxScroll)) * Math.max(0, track - thumb));
    for (let i = 0; i < track; i += 1) {
      const on = i >= pos && i < pos + thumb;
      buffer.put(laid.content.x + laid.content.width - 1, laid.content.y + 1 + i, on ? "█" : "░", style(ctx, on ? ctx.theme.accent : ctx.theme.muted, false));
    }
  }
  register(ctx, laid, {
    onKey: (key) => moveList(key, selected, rows.length, bodyHeight, runtime, laid.vnode.props.onSelect),
    onClick: (_x, y) => {
      if (y === 0) return;
      const index = runtime.scroll + y - 1;
      if (index >= 0 && index < rows.length) choose(laid, runtime, index, laid.vnode.props.onSelect);
    },
    onWheel: (delta) => {
      runtime.scroll = clamp(runtime.scroll + delta * 3, 0, maxScroll);
    },
  });
}

function paintImage(buffer: Buffer, laid: Laid, ctx: PaintContext): void {
  const raster = loadRaster(laid.id, laid.vnode.props);
  if (!raster) {
    buffer.putText(laid.content.x, laid.content.y, "image unavailable", style(ctx, ctx.theme.muted, false), laid.content.width);
    return;
  }
  paintRaster(buffer, laid.content, raster, ctx.bg);
}

function drawPanel(buffer: Buffer, rect: Rect, ctx: PaintContext, title: string, focused: boolean): void {
  const bg = ctx.theme.panel;
  const fg = focused ? ctx.theme.accent : ctx.theme.border;
  buffer.fillRect(rect, { fg, bg, bold: false });
  if (rect.width < 2 || rect.height < 2) return;
  const ink = { fg, bg, bold: false };
  buffer.put(rect.x, rect.y, "┌", ink);
  buffer.put(rect.x + rect.width - 1, rect.y, "┐", ink);
  buffer.put(rect.x, rect.y + rect.height - 1, "└", ink);
  buffer.put(rect.x + rect.width - 1, rect.y + rect.height - 1, "┘", ink);
  for (let x = 1; x < rect.width - 1; x += 1) {
    buffer.put(rect.x + x, rect.y, "─", ink);
    buffer.put(rect.x + x, rect.y + rect.height - 1, "─", ink);
  }
  for (let y = 1; y < rect.height - 1; y += 1) {
    buffer.put(rect.x, rect.y + y, "│", ink);
    buffer.put(rect.x + rect.width - 1, rect.y + y, "│", ink);
  }
  if (title && rect.width > 6) {
    const label = truncate(` ${title} `, rect.width - 4);
    buffer.putText(rect.x + 2, rect.y, label, { fg: ctx.theme.fg, bg, bold: true }, rect.width - 4);
  }
}

function scrollKey(runtime: WidgetRuntime, key: KeyEvent): boolean {
  const page = Math.max(1, runtime.viewport - 1);
  if (key.name === "up" || key.name === "k") {
    runtime.scroll = Math.max(0, runtime.scroll - 1);
    return true;
  }
  if (key.name === "down" || key.name === "j") {
    runtime.scroll += 1;
    return true;
  }
  if (key.name === "pageup") {
    runtime.scroll = Math.max(0, runtime.scroll - page);
    return true;
  }
  if (key.name === "pagedown") {
    runtime.scroll += page;
    return true;
  }
  if (key.name === "home") {
    runtime.scroll = 0;
    return true;
  }
  return false;
}

function moveList(key: KeyEvent, selected: number, length: number, viewport: number, runtime: WidgetRuntime, onSelect: unknown): boolean {
  if (!length) return false;
  let next = selected;
  if (key.name === "up" || key.name === "k") next -= 1;
  else if (key.name === "down" || key.name === "j") next += 1;
  else if (key.name === "pageup") next -= viewport;
  else if (key.name === "pagedown") next += viewport;
  else if (key.name === "home") next = 0;
  else if (key.name === "end") next = length - 1;
  else return false;
  next = clamp(next, 0, length - 1);
  runtime.selected = next;
  if (next < runtime.scroll) runtime.scroll = next;
  if (next >= runtime.scroll + viewport) runtime.scroll = next - viewport + 1;
  if (typeof onSelect === "function") onSelect(next);
  return true;
}

function choose(laid: Laid, runtime: WidgetRuntime, index: number, onSelect: unknown): void {
  runtime.selected = index;
  if (typeof onSelect === "function") onSelect(index);
  void laid;
}

function editInput(key: KeyEvent, value: string, runtime: WidgetRuntime, props: Record<string, unknown>): boolean {
  const commit = (next: string, cursor: number) => {
    runtime.cursor = cursor;
    if (typeof props.value !== "string") runtime.text = next;
    if (typeof props.onChange === "function") props.onChange(next);
  };
  if (key.name === "backspace") {
    if (runtime.cursor <= 0) return true;
    commit(value.slice(0, runtime.cursor - 1) + value.slice(runtime.cursor), runtime.cursor - 1);
    return true;
  }
  if (key.name === "delete") {
    commit(value.slice(0, runtime.cursor) + value.slice(runtime.cursor + 1), runtime.cursor);
    return true;
  }
  if (key.name === "left") {
    runtime.cursor = Math.max(0, runtime.cursor - 1);
    return true;
  }
  if (key.name === "right") {
    runtime.cursor = Math.min(value.length, runtime.cursor + 1);
    return true;
  }
  if (key.name === "home") {
    runtime.cursor = 0;
    return true;
  }
  if (key.name === "end") {
    runtime.cursor = value.length;
    return true;
  }
  if (key.name === "return") {
    if (typeof props.onSubmit === "function") props.onSubmit(value);
    return true;
  }
  if (key.name === "escape") {
    if (typeof props.onCancel === "function") props.onCancel();
    return true;
  }
  if (key.printable && !key.ctrl && !key.meta) {
    commit(value.slice(0, runtime.cursor) + key.printable + value.slice(runtime.cursor), runtime.cursor + key.printable.length);
    return true;
  }
  return false;
}

function columnWidths(columns: Array<Record<string, unknown>>, total: number): number[] {
  if (!columns.length || total <= 0) return [];
  const gaps = Math.max(0, columns.length - 1);
  const specified = columns.map((column) => (typeof column.width === "number" ? column.width : 0));
  const used = specified.reduce((sum, width) => sum + width, 0);
  const flex = columns.filter((column) => typeof column.width !== "number").length;
  let leftover = Math.max(0, total - gaps - used);
  const each = flex > 0 ? Math.floor(leftover / flex) : 0;
  let extra = flex > 0 ? leftover - each * flex : 0;
  let widths = columns.map((column) => {
    if (typeof column.width === "number") return column.width;
    const width = Math.max(3, each + (extra > 0 ? 1 : 0));
    if (extra > 0) extra -= 1;
    return width;
  });
  let sum = widths.reduce((acc, width) => acc + width, 0) + gaps;
  while (sum > total && widths.some((width) => width > 3)) {
    const index = widths.findIndex((width) => width > 3);
    if (index < 0) break;
    widths[index] -= 1;
    sum -= 1;
  }
  if (sum > total) {
    const scale = total / Math.max(1, sum);
    let usedWidth = 0;
    widths = widths.map((width, index) => {
      if (index === widths.length - 1) return Math.max(1, total - gaps - usedWidth);
      const next = Math.max(1, Math.floor(width * scale));
      usedWidth += next;
      return next;
    });
  }
  return widths;
}

function register(ctx: PaintContext, laid: Laid, extra: Omit<Hit, "id" | "rect">): void {
  ctx.hits.push({ id: laid.id, rect: laid.rect, ...extra });
}

function style(ctx: PaintContext, fg: string, bold: boolean): CellStyle {
  return { fg, bg: ctx.bg, bold };
}

function styleOn(ctx: PaintContext, fg: string, bold: boolean, bg: string): CellStyle {
  return { fg, bg, bold };
}

function toneColor(theme: Theme, tone: string): string {
  if (tone === "muted") return theme.muted;
  if (tone === "accent") return theme.accent;
  if (tone === "warn") return theme.warn;
  if (tone === "hot") return theme.hot;
  return theme.fg;
}

function stringProp(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberProp(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberMaybe(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function call(value: unknown): void {
  if (typeof value === "function") value();
}

export type { Hit };

export function topHit(hits: Hit[], x: number, y: number, accept: (hit: Hit) => boolean = () => true): Hit | undefined {
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const hit = hits[index];
    if (!hit || !accept(hit)) continue;
    if (x >= hit.rect.x && y >= hit.rect.y && x < hit.rect.x + hit.rect.width && y < hit.rect.y + hit.rect.height) return hit;
  }
  return undefined;
}
