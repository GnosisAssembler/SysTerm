export type Size = number | `${number}%`;

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutStyle {
  width?: Size;
  height?: Size;
  flexGrow?: number;
  padding?: number | Partial<Edges>;
}

export interface VNode {
  type: string;
  key?: string;
  props: Record<string, unknown>;
  style: LayoutStyle;
  children: VNode[];
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CellStyle {
  fg: string;
  bg: string;
  bold: boolean;
}

export type ColorMode = "truecolor" | "256" | "16";

export type ThemeName = "mint" | "dusk";

export interface Theme {
  name: ThemeName;
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  warn: string;
  hot: string;
  border: string;
  selection: string;
  panel: string;
}

export interface KeyEvent {
  name: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  printable: string;
}

export interface MouseEvent {
  kind: "down" | "up" | "scroll" | "move";
  button: number;
  x: number;
  y: number;
  delta: number;
}

export type InputEvent =
  | { type: "key"; key: KeyEvent }
  | { type: "mouse"; mouse: MouseEvent };
