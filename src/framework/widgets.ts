import { createNode, isVNode, type Child } from "./vnode.js";
import type { Size, VNode } from "./types.js";

export type { Child };

export interface LayoutProps {
  key?: string;
  width?: Size;
  height?: Size;
  flexGrow?: number;
  padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
  autofocus?: boolean;
}

export interface TextProps extends LayoutProps {
  tone?: "muted" | "accent" | "warn" | "hot";
  nowrap?: boolean;
}

export interface PanelProps extends LayoutProps {
  title?: string;
}

export interface TableColumn {
  key: string;
  title: string;
  width?: number;
  align?: "left" | "right";
}

export interface BarItem {
  label: string;
  value: number;
  max?: number;
}

function isProps(value: unknown): value is LayoutProps {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !isVNode(value);
}

function box(first: LayoutProps | Child | undefined, rest: Child[], type: "column" | "row"): VNode {
  if (isProps(first)) return createNode(type, first, rest);
  return createNode(type, {}, [first, ...rest]);
}

export function column(first?: LayoutProps | Child, ...rest: Child[]): VNode {
  return box(first, rest, "column");
}

export function row(first?: LayoutProps | Child, ...rest: Child[]): VNode {
  return box(first, rest, "row");
}

export function panel(props: PanelProps, ...children: Child[]): VNode {
  return createNode("panel", { padding: { left: 1, right: 1 }, ...props }, children);
}

export function spacer(props: LayoutProps = {}): VNode {
  return createNode("spacer", { flexGrow: 1, ...props }, []);
}

export function scroll(props: LayoutProps, ...children: Child[]): VNode {
  return createNode("scroll", props, [column(...children)]);
}

export function text(content: string, props?: TextProps): VNode {
  return createNode("text", { ...props, content }, []);
}

export function banner(label: string, props?: LayoutProps): VNode {
  return createNode("banner", { ...props, label }, []);
}

export function ascii(art: string, props?: LayoutProps): VNode {
  return createNode("ascii", { ...props, art }, []);
}

export function sparkline(props: LayoutProps & { data: number[]; min?: number; max?: number }): VNode {
  return createNode("sparkline", props, []);
}

export function lineChart(props: LayoutProps & { data: number[]; min?: number; max?: number; label?: string }): VNode {
  return createNode("lineChart", props, []);
}

export function barChart(props: LayoutProps & { items: BarItem[] }): VNode {
  return createNode("barChart", props, []);
}

export function gauge(props: LayoutProps & { label?: string; value: number; max?: number }): VNode {
  return createNode("gauge", props, []);
}

export function heatmap(props: LayoutProps & { values: number[][]; min?: number; max?: number }): VNode {
  return createNode("heatmap", props, []);
}

export function table(props: LayoutProps & {
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
  selected?: number;
  onSelect?: (index: number) => void;
  empty?: string;
}): VNode {
  return createNode("table", props, []);
}

export function tabs(props: LayoutProps & { tabs: string[]; selected?: number; onSelect?: (index: number) => void }): VNode {
  return createNode("tabs", props, []);
}

export function select(props: LayoutProps & { options: string[]; selected?: number; onSelect?: (index: number) => void }): VNode {
  return createNode("select", props, []);
}

export function textInput(props: LayoutProps & {
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
}): VNode {
  return createNode("textInput", props, []);
}

export function checkbox(props: LayoutProps & { label: string; checked?: boolean; onChange?: (checked: boolean) => void }): VNode {
  return createNode("checkbox", props, []);
}

export function button(props: LayoutProps & { label: string; onPress?: () => void }): VNode {
  return createNode("button", props, []);
}

export function progress(props: LayoutProps & { label?: string; value: number; max?: number }): VNode {
  return createNode("progress", props, []);
}

export function modal(props: PanelProps & { onClose?: () => void }, ...children: Child[]): VNode {
  return createNode("modal", { padding: { left: 1, right: 1 }, ...props }, children);
}

export function image(props: LayoutProps & { data?: Buffer; path?: string; cols?: number; rows?: number }): VNode {
  return createNode("image", props, []);
}
