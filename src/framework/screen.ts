import { InputParser } from "./input.js";
import type { InputEvent } from "./types.js";

export class Screen {
  private readonly parser = new InputParser();
  private escapeTimer: NodeJS.Timeout | null = null;
  private active = false;
  private onEvent: (event: InputEvent) => void = () => {};
  private onResizeCb: () => void = () => {};

  constructor(private readonly title = "SysTerm") {}

  get cols(): number {
    return process.stdout.columns || 80;
  }

  get rows(): number {
    return process.stdout.rows || 24;
  }

  enter(onEvent: (event: InputEvent) => void, onResize: () => void): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error("SysTerm needs an interactive terminal. Open it in Windows Terminal, iTerm, or another TTY.");
    }
    this.onEvent = onEvent;
    this.onResizeCb = onResize;
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    process.stdin.resume();
    process.stdin.on("data", this.onData);
    process.stdout.on("resize", this.handleResize);
    process.on("SIGINT", this.handleSignal);
    process.on("SIGTERM", this.handleSignal);
    this.active = true;
    const safeTitle = this.title.replace(/[\u0007\u001b]/g, "");
    this.write(`\u001b[?1049h\u001b[?25l\u001b[?1000h\u001b[?1006h\u001b]0;${safeTitle}\u0007`);
  }

  leave(): void {
    if (!this.active) return;
    this.active = false;
    if (this.escapeTimer) clearTimeout(this.escapeTimer);
    this.write("\u001b[?1006l\u001b[?1000l\u001b[?25h\u001b[?1049l");
    process.stdin.off("data", this.onData);
    process.stdout.off("resize", this.handleResize);
    process.off("SIGINT", this.handleSignal);
    process.off("SIGTERM", this.handleSignal);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  write(value: string): void {
    if (value) process.stdout.write(value);
  }

  private onData = (chunk: string): void => {
    if (this.escapeTimer) {
      clearTimeout(this.escapeTimer);
      this.escapeTimer = null;
    }
    for (const event of this.parser.push(chunk)) this.onEvent(event);
    if (this.parser.pendingEscape) {
      this.escapeTimer = setTimeout(() => {
        this.escapeTimer = null;
        for (const event of this.parser.flushEscape()) this.onEvent(event);
      }, 25);
    }
  };

  private handleResize = (): void => {
    this.onResizeCb();
  };

  private handleSignal = (): void => {
    this.leave();
    process.exit(0);
  };
}
