import type { LayoutStyle, Size, VNode } from "./types.js";

export type Child = VNode | null | false | undefined | Child[];

export function isVNode(value: unknown): value is VNode {
  return Boolean(value) && typeof value === "object" && typeof (value as VNode).type === "string" && "props" in (value as VNode) && Array.isArray((value as VNode).children);
}

export function flatten(children: Child[]): VNode[] {
  const out: VNode[] = [];
  for (const child of children) {
    if (!child) continue;
    if (Array.isArray(child)) {
      out.push(...flatten(child));
      continue;
    }
    if (isVNode(child)) out.push(child);
  }
  return out;
}

export function createNode(type: string, props: object | undefined, children: Child[]): VNode {
  const source = (props ?? {}) as Record<string, unknown>;
  const style: LayoutStyle = {};
  if (typeof source.width === "number" || typeof source.width === "string") style.width = source.width as Size;
  if (typeof source.height === "number" || typeof source.height === "string") style.height = source.height as Size;
  if (typeof source.flexGrow === "number") style.flexGrow = source.flexGrow;
  if (typeof source.padding === "number" || (source.padding && typeof source.padding === "object")) {
    style.padding = source.padding as LayoutStyle["padding"];
  }
  const rest: Record<string, unknown> = { ...source };
  delete rest.width;
  delete rest.height;
  delete rest.flexGrow;
  delete rest.padding;
  delete rest.key;
  return {
    type,
    key: typeof source.key === "string" ? source.key : undefined,
    props: rest,
    style,
    children: flatten(children),
  };
}
