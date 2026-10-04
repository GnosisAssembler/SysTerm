import { Buffer } from "./buffer.js";
import { layoutTree, resolveFocus } from "./layout.js";
import { paintLaid, type PaintContext } from "./paint.js";
import { themeByName } from "./theme.js";
import type { ThemeName, VNode } from "./types.js";
import { UIState } from "./ui-state.js";

export interface FrameOptions {
  cols: number;
  rows: number;
  theme?: ThemeName;
  ui?: UIState;
}

export function renderTree(tree: VNode, options: FrameOptions): Buffer {
  const theme = themeByName(options.theme ?? "mint");
  const ui = options.ui ?? new UIState();
  const laid = layoutTree(tree, options.cols, options.rows, ui);
  resolveFocus(laid, ui);
  const buffer = new Buffer(options.cols, options.rows, { fg: theme.fg, bg: theme.bg, bold: false });
  const ctx: PaintContext = { theme, ui, hits: [], bg: theme.bg };
  paintLaid(laid, buffer, ctx);
  return buffer;
}

export function renderFrame(tree: VNode, options: FrameOptions): string {
  return renderTree(tree, options).toString();
}
