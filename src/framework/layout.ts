import { fitFiglet } from "./figlet.js";
import type { UIState } from "./ui-state.js";
import { wrapPlain } from "./text.js";
import type { Edges, LayoutStyle, Rect, Size, VNode } from "./types.js";
import { clamp, widthOf } from "./util.js";

export interface Laid {
  id: string;
  vnode: VNode;
  rect: Rect;
  content: Rect;
  children: Laid[];
  modals: Laid[];
}

export interface MainItem {
  basis: number;
  grow: number;
  shrink: number;
}

export function parseSpec(spec: Size | undefined, available: number): number | null {
  if (spec == null) return null;
  if (typeof spec === "number" && Number.isFinite(spec)) return Math.max(0, Math.floor(spec));
  if (typeof spec === "string" && spec.endsWith("%")) {
    const value = Number.parseFloat(spec);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.floor((value / 100) * available));
  }
  return null;
}

export function allocateMain(items: MainItem[], space: number): number[] {
  const mains = items.map((item) => Math.max(0, item.basis));
  const total = () => mains.reduce((sum, value) => sum + value, 0);
  let sum = total();
  if (sum < space) {
    const extra = space - sum;
    const growers = items.map((item, index) => ({ item, index })).filter((entry) => entry.item.grow > 0);
    const growSum = growers.reduce((acc, entry) => acc + entry.item.grow, 0);
    if (growSum > 0) {
      let used = 0;
      growers.forEach((entry, index) => {
        const add = index === growers.length - 1 ? extra - used : Math.floor((extra * entry.item.grow) / growSum);
        mains[entry.index] += add;
        used += add;
      });
    }
    return mains;
  }
  if (sum > space) {
    const overflow = sum - space;
    const shrinkers = items.map((item, index) => ({ item, index })).filter((entry) => entry.item.shrink > 0 && mains[entry.index] > 0);
    if (shrinkers.length) {
      const basisSum = shrinkers.reduce((acc, entry) => acc + mains[entry.index], 0) || 1;
      let used = 0;
      shrinkers.forEach((entry, index) => {
        const share = index === shrinkers.length - 1
          ? overflow - used
          : Math.min(mains[entry.index], Math.floor((overflow * mains[entry.index]) / basisSum));
        const cut = clamp(share, 0, mains[entry.index]);
        mains[entry.index] -= cut;
        used += cut;
      });
    }
    sum = total();
    if (sum > space && sum > 0) {
      let used = 0;
      mains.forEach((value, index) => {
        if (index === mains.length - 1) mains[index] = Math.max(0, space - used);
        else {
          mains[index] = Math.floor((value * space) / sum);
          used += mains[index];
        }
      });
    }
  }
  return mains;
}

export function layoutTree(root: VNode, cols: number, rows: number, ui: UIState): Laid {
  const modals: VNode[] = [];
  const stripped = stripModals(root, modals);
  const screen = { x: 0, y: 0, width: Math.max(0, cols), height: Math.max(0, rows) };
  const laid = place(stripped, screen, "0", ui);
  laid.modals = modals.map((modal, index) => placeModal(modal, screen, `modal${index}`, ui));
  return laid;
}

function stripModals(node: VNode, bucket: VNode[]): VNode {
  const children: VNode[] = [];
  for (const child of node.children) {
    if (child.type === "modal") {
      const nested: VNode[] = [];
      bucket.push(stripModals(child, nested));
      bucket.push(...nested);
    } else {
      children.push(stripModals(child, bucket));
    }
  }
  return { ...node, children };
}

function placeModal(node: VNode, screen: Rect, path: string, ui: UIState): Laid {
  const preferred = intrinsicSize(node, Math.max(0, screen.width - 4), Math.max(0, screen.height - 4));
  const width = Math.min(screen.width, parseSpec(node.style.width, screen.width) ?? Math.max(preferred.w, Math.min(24, screen.width)));
  const height = Math.min(screen.height, parseSpec(node.style.height, screen.height) ?? Math.max(preferred.h, Math.min(8, screen.height)));
  const rect = {
    x: Math.max(0, Math.floor((screen.width - width) / 2)),
    y: Math.max(0, Math.floor((screen.height - height) / 2)),
    width,
    height,
  };
  return place(node, rect, path, ui);
}

function place(vnode: VNode, rect: Rect, path: string, ui: UIState): Laid {
  const id = vnode.key ? `key:${vnode.key}` : path;
  const box = chrome(vnode);
  const content = inset(rect, box);
  let children: Laid[] = [];
  if (vnode.type === "scroll") children = placeScroll(vnode, content, id, ui);
  else if (isFlex(vnode.type)) children = placeFlex(vnode, content, id, ui);
  return { id, vnode, rect, content, children, modals: [] };
}

function placeScroll(vnode: VNode, content: Rect, id: string, ui: UIState): Laid[] {
  const child = vnode.children[0];
  if (!child || content.width <= 0) return [];
  const size = intrinsicSize(child, content.width, 100_000);
  const runtime = ui.runtime(id);
  const maxScroll = Math.max(0, size.h - Math.max(0, content.height));
  runtime.scroll = clamp(runtime.scroll, 0, maxScroll);
  runtime.viewport = Math.max(1, content.height);
  return [
    place(child, {
      x: content.x,
      y: content.y - runtime.scroll,
      width: content.width,
      height: Math.max(size.h, content.height),
    }, `${id}/0`, ui),
  ];
}

function placeFlex(vnode: VNode, content: Rect, id: string, ui: UIState): Laid[] {
  const horizontal = vnode.type === "row";
  const main = Math.max(0, horizontal ? content.width : content.height);
  const cross = Math.max(0, horizontal ? content.height : content.width);
  const flow = vnode.children.filter((child) => child.type !== "modal");
  const specs: MainItem[] = flow.map((child) => {
    const mainSpec = horizontal ? child.style.width : child.style.height;
    const definite = parseSpec(mainSpec, main);
    const grow = child.style.flexGrow ?? 0;
    if (definite != null) return { basis: definite, grow, shrink: 0 };
    if (grow > 0) return { basis: 0, grow, shrink: 1 };
    const size = intrinsicSize(child, horizontal ? main : cross, horizontal ? cross : main);
    return { basis: horizontal ? size.w : size.h, grow: 0, shrink: 1 };
  });
  const mains = allocateMain(specs, main);
  let cursor = horizontal ? content.x : content.y;
  return flow.map((child, index) => {
    const crossSpec = parseSpec(horizontal ? child.style.height : child.style.width, cross);
    const crossSize = crossSpec ?? cross;
    const mainSize = mains[index] ?? 0;
    const rect = horizontal
      ? { x: cursor, y: content.y, width: mainSize, height: crossSize }
      : { x: content.x, y: cursor, width: crossSize, height: mainSize };
    cursor += mainSize;
    return place(child, rect, `${id}/${index}`, ui);
  });
}

function isFlex(type: string): boolean {
  return type === "column" || type === "row" || type === "panel" || type === "modal";
}

function chrome(vnode: VNode): Edges {
  const border = vnode.type === "panel" || vnode.type === "modal" ? 1 : 0;
  const padding = paddingOf(vnode.style);
  return {
    top: border + padding.top,
    right: border + padding.right,
    bottom: border + padding.bottom,
    left: border + padding.left,
  };
}

function paddingOf(style: LayoutStyle): Edges {
  const padding = style.padding;
  if (typeof padding === "number") return { top: padding, right: padding, bottom: padding, left: padding };
  return {
    top: padding?.top ?? 0,
    right: padding?.right ?? 0,
    bottom: padding?.bottom ?? 0,
    left: padding?.left ?? 0,
  };
}

function inset(rect: Rect, box: Edges): Rect {
  return {
    x: rect.x + box.left,
    y: rect.y + box.top,
    width: Math.max(0, rect.width - box.left - box.right),
    height: Math.max(0, rect.height - box.top - box.bottom),
  };
}

export function intrinsicSize(node: VNode, maxWidth: number, maxHeight: number): { w: number; h: number } {
  const box = chrome(node);
  const innerW = Math.max(0, maxWidth - box.left - box.right);
  const innerH = Math.max(0, maxHeight - box.top - box.bottom);
  if (node.type === "column" || node.type === "panel" || node.type === "modal") {
    let width = 0;
    let height = 0;
    for (const child of node.children) {
      if (child.type === "modal") continue;
      const childWidth = parseSpec(child.style.width, innerW) ?? innerW;
      if (child.style.flexGrow && child.style.height == null) {
        width = Math.max(width, intrinsicSize(child, childWidth, innerH).w);
        height += 1;
      } else if (child.style.height != null) {
        const fixed = parseSpec(child.style.height, innerH) ?? 1;
        width = Math.max(width, intrinsicSize(child, childWidth, fixed).w);
        height += fixed;
      } else {
        const size = intrinsicSize(child, childWidth, innerH);
        width = Math.max(width, size.w);
        height += size.h;
      }
    }
    return fit(width + box.left + box.right, height + box.top + box.bottom, maxWidth, maxHeight);
  }
  if (node.type === "row") {
    let width = 0;
    let height = 0;
    for (const child of node.children) {
      if (child.type === "modal") continue;
      const size = intrinsicSize(child, innerW, innerH);
      const childWidth = parseSpec(child.style.width, innerW) ?? (child.style.flexGrow ? 1 : size.w);
      const childHeight = parseSpec(child.style.height, innerH) ?? size.h;
      width += childWidth;
      height = Math.max(height, childHeight);
    }
    return fit(width + box.left + box.right, height + box.top + box.bottom, maxWidth, maxHeight);
  }
  if (node.type === "scroll") {
    const child = node.children.find((item) => item.type !== "modal");
    const size = child ? intrinsicSize(child, innerW, 100_000) : { w: 0, h: 1 };
    return fit(Math.max(size.w, 1) + box.left + box.right, Math.min(Math.max(size.h, 1), maxHeight) + box.top + box.bottom, maxWidth, maxHeight);
  }
  const leaf = leafSize(node, innerW);
  return fit(leaf.w + box.left + box.right, leaf.h + box.top + box.bottom, maxWidth, maxHeight);
}

function leafSize(node: VNode, maxWidth: number): { w: number; h: number } {
  const width = Math.max(0, maxWidth);
  switch (node.type) {
    case "text": {
      const raw = String(node.props.content ?? "");
      if (node.props.nowrap) return { w: Math.min(width, Math.max(1, widthOf(raw))), h: 1 };
      const lines = wrapPlain(raw, Math.max(1, width));
      const widest = Math.max(1, ...lines.map((line) => widthOf(line)), 0);
      return { w: Math.min(width, widest), h: Math.max(1, lines.length) };
    }
    case "ascii": {
      const lines = trimLines(String(node.props.art ?? ""));
      return { w: Math.min(width, Math.max(1, ...lines.map((line) => widthOf(line)), 0)), h: Math.max(1, lines.length) };
    }
    case "banner": {
      const lines = trimLines(fitFiglet(String(node.props.label ?? ""), Math.max(1, width)));
      return { w: Math.min(width, Math.max(1, ...lines.map((line) => widthOf(line)), 0)), h: Math.max(1, lines.length) };
    }
    case "spacer":
      return { w: 0, h: 0 };
    case "gauge":
      return { w: Math.min(width, 24), h: 2 };
    case "lineChart":
      return { w: Math.min(width, 24), h: 8 };
    case "barChart":
      return { w: Math.min(width, 24), h: Math.max(1, listLength(node.props.items)) };
    case "heatmap":
      return { w: Math.min(width, 24), h: Math.max(1, listLength(node.props.values)) };
    case "table":
      return { w: Math.min(width, 40), h: Math.max(2, 1 + listLength(node.props.rows)) };
    case "select":
      return { w: Math.min(width, 24), h: Math.max(1, listLength(node.props.options)) };
    case "image": {
      const imageWidth = numberProp(node.props.cols, 16);
      const imageHeight = numberProp(node.props.rows, 8);
      return { w: Math.min(width, imageWidth), h: imageHeight };
    }
    default:
      return { w: Math.min(width, 20), h: 1 };
  }
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberProp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function trimLines(text: string): string[] {
  const lines = text.split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : [""];
}

function fit(width: number, height: number, maxWidth: number, maxHeight: number): { w: number; h: number } {
  return {
    w: clamp(width, 0, Math.max(0, maxWidth)),
    h: clamp(height, 0, Math.max(0, maxHeight)),
  };
}

export function containsId(laid: Laid, id: string | null): boolean {
  if (!id) return false;
  if (laid.id === id) return true;
  return laid.children.some((child) => containsId(child, id)) || laid.modals.some((modal) => containsId(modal, id));
}

export function findAutofocus(laid: Laid): string | null {
  if (laid.vnode.props.autofocus === true) return laid.id;
  for (const child of laid.children) {
    const found = findAutofocus(child);
    if (found) return found;
  }
  for (const modal of laid.modals) {
    const found = findAutofocus(modal);
    if (found) return found;
  }
  return null;
}

export function resolveFocus(root: Laid, ui: UIState): void {
  const modal = root.modals[root.modals.length - 1];
  if (modal) {
    if (!ui.focusedKey || !containsId(modal, ui.focusedKey)) ui.focusedKey = findAutofocus(modal) ?? modal.id;
    return;
  }
  if (!ui.focusedKey || !containsId(root, ui.focusedKey)) ui.focusedKey = findAutofocus(root);
}
