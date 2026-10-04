import { Buffer } from "./buffer.js";
import { layoutTree, resolveFocus } from "./layout.js";
import { paintLaid, topHit, type PaintContext } from "./paint.js";
import { Screen } from "./screen.js";
import { detectColorMode, themeByName } from "./theme.js";
import type { InputEvent, KeyEvent, Theme, ThemeName, VNode } from "./types.js";
import { UIState } from "./ui-state.js";

export interface AppContext<S> {
  readonly state: S;
  setState: (patch: Partial<S> | ((state: S) => S)) => void;
  readonly theme: Theme;
  readonly themeName: ThemeName;
  setTheme: (name: ThemeName) => void;
  readonly cols: number;
  readonly rows: number;
  readonly focusedKey: string | null;
  focus: (key: string | null) => void;
  exit: () => void;
}

export interface RunOptions<S> {
  title?: string;
  fps?: number;
  theme?: ThemeName;
  state: S;
  render: (ctx: AppContext<S>) => VNode;
  onKey?: (key: KeyEvent, ctx: AppContext<S>) => void;
  setup?: (ctx: AppContext<S>) => void | (() => void) | Promise<void | (() => void)>;
}

export async function run<S>(options: RunOptions<S>): Promise<void> {
  const screen = new Screen(options.title ?? "SysTerm");
  const ui = new UIState();
  const colorMode = detectColorMode();
  let state = options.state;
  let themeName = options.theme ?? "mint";
  let theme = themeByName(themeName);
  let running = true;
  let drawing = false;
  let handling = false;
  let queued = false;
  let previous: Buffer | null = null;
  let hits: PaintContext["hits"] = [];
  let timer: NodeJS.Timeout | undefined;
  let cleanup: void | (() => void);
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const ctx: AppContext<S> = {
    get state() {
      return state;
    },
    setState(patch) {
      state = typeof patch === "function" ? patch(state) : { ...state, ...patch };
      if (!handling) schedule();
    },
    get theme() {
      return theme;
    },
    get themeName() {
      return themeName;
    },
    setTheme(name) {
      themeName = name;
      theme = themeByName(name);
      if (!handling) schedule();
    },
    get cols() {
      return screen.cols;
    },
    get rows() {
      return screen.rows;
    },
    get focusedKey() {
      return ui.focusedKey;
    },
    focus(key) {
      ui.focusedKey = key ? (key.startsWith("key:") ? key : `key:${key}`) : null;
      if (!handling) schedule();
    },
    exit() {
      stop();
    },
  };

  const schedule = () => {
    if (!running) return;
    if (drawing) {
      queued = true;
      return;
    }
    setTimeout(() => {
      if (running) draw();
    }, 0);
  };

  const draw = () => {
    if (!running || drawing) return;
    drawing = true;
    try {
      const cols = Math.max(1, screen.cols);
      const rows = Math.max(1, screen.rows);
      const tree = options.render(ctx);
      const laid = layoutTree(tree, cols, rows, ui);
      resolveFocus(laid, ui);
      const buffer = new Buffer(cols, rows, { fg: theme.fg, bg: theme.bg, bold: false });
      const paint: PaintContext = { theme, ui, hits: [], bg: theme.bg };
      paintLaid(laid, buffer, paint);
      screen.write(buffer.diff(previous, colorMode));
      previous = buffer;
      hits = paint.hits;
    } catch (error) {
      stop();
      console.error(error);
    } finally {
      drawing = false;
      if (queued && running) {
        queued = false;
        schedule();
      }
    }
  };

  const stop = () => {
    if (!running) return;
    running = false;
    if (timer) clearInterval(timer);
    try {
      cleanup?.();
    } catch {
      // Cleanup should not trap the terminal.
    }
    screen.leave();
    resolveDone();
  };

  const handle = (event: InputEvent) => {
    if (!running) return;
    handling = true;
    try {
      if (event.type === "mouse") {
        if (event.mouse.kind === "scroll") {
          topHit(hits, event.mouse.x, event.mouse.y, (hit) => Boolean(hit.onWheel))?.onWheel?.(event.mouse.delta);
        } else if (event.mouse.kind === "down") {
          const hit = topHit(hits, event.mouse.x, event.mouse.y);
          if (hit) {
            ui.focusedKey = hit.id;
            hit.onClick?.(event.mouse.x - hit.rect.x, event.mouse.y - hit.rect.y);
          }
        }
        return;
      }
      if (event.key.ctrl && event.key.name === "c") {
        stop();
        return;
      }
      const focused = hits.find((hit) => hit.id === ui.focusedKey);
      if (focused?.onKey?.(event.key)) return;
      options.onKey?.(event.key, ctx);
    } finally {
      handling = false;
      if (running) draw();
    }
  };

  screen.enter(handle, () => {
    previous = null;
    draw();
  });
  try {
    cleanup = await options.setup?.(ctx);
    draw();
    const fps = Math.max(1, options.fps ?? 8);
    timer = setInterval(() => draw(), Math.round(1000 / fps));
    await done;
  } catch (error) {
    stop();
    throw error;
  }
}
