export interface WidgetRuntime {
  scroll: number;
  selected: number;
  cursor: number;
  viewport: number;
  text: string;
}

export class UIState {
  widgets = new Map<string, WidgetRuntime>();
  focusedKey: string | null = null;

  runtime(id: string): WidgetRuntime {
    let current = this.widgets.get(id);
    if (!current) {
      current = { scroll: 0, selected: 0, cursor: 0, viewport: 1, text: "" };
      this.widgets.set(id, current);
    }
    return current;
  }
}
