import type { InputEvent, KeyEvent, MouseEvent } from "./types.js";
import { firstGrapheme } from "./util.js";

const NEED = Symbol("need");

export class InputParser {
  private buf = "";

  push(chunk: string): InputEvent[] {
    this.buf += chunk;
    const events: InputEvent[] = [];
    while (this.buf.length) {
      const next = this.parseOne();
      if (next === NEED) break;
      if (next) events.push(next);
    }
    return events;
  }

  get pendingEscape(): boolean {
    return this.buf === "\u001b";
  }

  flushEscape(): InputEvent[] {
    if (this.buf !== "\u001b") return [];
    this.buf = "";
    return [{ type: "key", key: named("escape") }];
  }

  private parseOne(): InputEvent | typeof NEED | null {
    const source = this.buf;
    if (source.startsWith("\u001b[<")) {
      const match = /^\u001b\[<(\d+);(\d+);(\d+)([Mm])/.exec(source);
      if (!match) return source.length > 48 ? this.dropOne() : NEED;
      this.buf = source.slice(match[0].length);
      return { type: "mouse", mouse: mouseFrom(match) };
    }
    if (source.startsWith("\u001b[")) {
      const match = /^\u001b\[([0-9;]*)([\x40-\x7e])/.exec(source);
      if (!match) return source.length > 32 ? this.dropOne() : NEED;
      this.buf = source.slice(match[0].length);
      return { type: "key", key: csiKey(match[1] ?? "", match[2] ?? "") };
    }
    if (source.startsWith("\u001bO")) {
      if (source.length < 3) return NEED;
      this.buf = source.slice(3);
      return { type: "key", key: ss3Key(source[2] ?? "") };
    }
    if (source.startsWith("\u001b")) {
      if (source.length === 1) return NEED;
      const glyph = firstGrapheme(source.slice(1));
      this.buf = source.slice(1 + glyph.length);
      if (glyph === "\u001b") {
        this.buf = source.slice(1);
        return { type: "key", key: named("escape") };
      }
      const event = plainKey(glyph);
      if (event.type === "key") event.key.meta = true;
      return event;
    }
    const glyph = firstGrapheme(source);
    if (!glyph) {
      this.buf = "";
      return null;
    }
    this.buf = source.slice(glyph.length);
    return plainKey(glyph);
  }

  private dropOne(): null {
    this.buf = this.buf.slice(1);
    return null;
  }
}

function mouseFrom(match: RegExpMatchArray): MouseEvent {
  const code = Number(match[1]);
  const x = Number(match[2]) - 1;
  const y = Number(match[3]) - 1;
  const release = match[4] === "m";
  if (code === 64 || code === 65) {
    return { kind: "scroll", button: code, x, y, delta: code === 64 ? -1 : 1 };
  }
  if ((code & 32) !== 0) return { kind: "move", button: code & 3, x, y, delta: 0 };
  return { kind: release ? "up" : "down", button: code & 3, x, y, delta: 0 };
}

function csiKey(params: string, final: string): KeyEvent {
  const parts = params.length ? params.split(";").map((part) => Number(part)) : [];
  const mod = modifiers(parts);
  if (final === "A") return named("up", mod);
  if (final === "B") return named("down", mod);
  if (final === "C") return named("right", mod);
  if (final === "D") return named("left", mod);
  if (final === "H") return named("home", mod);
  if (final === "F") return named("end", mod);
  if (final === "Z") return named("tab", { ...mod, shift: true });
  if (final === "~") {
    const map: Record<number, string> = { 1: "home", 2: "insert", 3: "delete", 4: "end", 5: "pageup", 6: "pagedown" };
    return named(map[parts[0] ?? 0] ?? "unknown", mod);
  }
  return named(final, mod);
}

function ss3Key(symbol: string): KeyEvent {
  const map: Record<string, string> = { A: "up", B: "down", C: "right", D: "left", H: "home", F: "end" };
  return named(map[symbol] ?? symbol);
}

function modifiers(parts: number[]): Pick<KeyEvent, "ctrl" | "shift" | "meta"> {
  const code = parts.length >= 2 ? parts[1] ?? 0 : 0;
  if (!code) return { ctrl: false, shift: false, meta: false };
  const bits = code - 1;
  return { shift: Boolean(bits & 1), meta: Boolean(bits & 2), ctrl: Boolean(bits & 4) };
}

function plainKey(glyph: string): InputEvent {
  if (glyph === "\r" || glyph === "\n") return { type: "key", key: named("return") };
  if (glyph === "\t") return { type: "key", key: named("tab") };
  if (glyph === "\u007f" || glyph === "\b") return { type: "key", key: named("backspace") };
  const code = glyph.length === 1 ? glyph.charCodeAt(0) : Number.NaN;
  if (code >= 1 && code <= 26) {
    return { type: "key", key: { name: String.fromCharCode(96 + code), ctrl: true, shift: false, meta: false, printable: "" } };
  }
  if (glyph === " ") return { type: "key", key: { name: "space", ctrl: false, shift: false, meta: false, printable: " " } };
  if (!Number.isNaN(code) && code >= 32) return { type: "key", key: { name: glyph, ctrl: false, shift: false, meta: false, printable: glyph } };
  if (glyph.length > 1) return { type: "key", key: { name: glyph, ctrl: false, shift: false, meta: false, printable: glyph } };
  return { type: "key", key: named(glyph) };
}

function named(name: string, flags: Pick<KeyEvent, "ctrl" | "shift" | "meta"> = { ctrl: false, shift: false, meta: false }): KeyEvent {
  return { name, printable: "", ...flags };
}
