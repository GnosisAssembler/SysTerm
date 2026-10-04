import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { Buffer } from "../src/framework/buffer.js";
import { brailleChart, sparklineChars } from "../src/framework/charts.js";
import { allocateMain } from "../src/framework/layout.js";
import { InputParser } from "../src/framework/input.js";
import { renderFrame, renderTree } from "../src/framework/render.js";
import { parseMarkup } from "../src/framework/text.js";
import { checkbox, column, image, row, table, text } from "../src/framework/widgets.js";
import { monitorView } from "../src/monitor/ui.js";
import { initialState } from "../src/monitor/state.js";

describe("text and charts", () => {
  it("splits markup into style spans", () => {
    expect(parseMarkup("{b}bold{/b} {#ff0000}red{/}")).toEqual([
      { text: "bold", bold: true, fg: undefined },
      { text: " ", bold: false, fg: undefined },
      { text: "red", bold: false, fg: "#ff0000" },
    ]);
  });

  it("maps sparkline values onto the block ramp", () => {
    expect(sparklineChars([0, 0.5, 1], 3, 0, 1)).toBe("▁▅█");
  });

  it("draws a flat braille line across the top dots", () => {
    const lines = brailleChart([1, 1], 1, 1, 0, 1);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.codePointAt(0)).toBe(0x2800 + 0x01 + 0x08);
  });
});

describe("layout and diff", () => {
  it("gives leftover rows to a flex child", () => {
    const frame = renderFrame(
      column(text("A", { flexGrow: 1 }), text("B")),
      { cols: 10, rows: 5 },
    );
    const lines = frame.split("\n");
    expect(lines[0]).toContain("A");
    expect(lines[1]).not.toContain("B");
    expect(lines[4]).toContain("B");
  });

  it("splits a row by percent", () => {
    const frame = renderFrame(
      rowPair(),
      { cols: 10, rows: 1 },
    );
    expect(frame.indexOf("R")).toBeGreaterThanOrEqual(4);
  });

  it("patches only the changed cell", () => {
    const base = { fg: "#ffffff", bg: "#000000", bold: false };
    const before = new Buffer(10, 3, base);
    const after = before.clone();
    after.put(2, 1, "X", base);
    const patch = after.diff(before, "truecolor");
    expect(patch).toContain("X");
    expect(patch).toContain("\u001b[2;3H");
    expect(patch.length).toBeLessThan(80);
    expect(patch).not.toContain("          ");
  });

  it("distributes flex grow across the free space", () => {
    expect(allocateMain([{ basis: 0, grow: 1, shrink: 1 }, { basis: 1, grow: 0, shrink: 1 }], 5)).toEqual([4, 1]);
  });
});

describe("widgets", () => {
  it("paints only the visible table window", () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      name: index === 0 ? "alpha-row" : index === 40 ? "omega-row" : `row-${index}`,
    }));
    const frame = renderFrame(
      table({
        columns: [{ key: "name", title: "name", width: 12 }],
        rows,
      }),
      { cols: 20, rows: 8 },
    );
    expect(frame).toContain("alpha-row");
    expect(frame).not.toContain("omega-row");
  });

  it("turns a 2x2 png into one half-block cell", () => {
    const png = new PNG({ width: 2, height: 2 });
    fill(png, 0, 0, 255, 0, 0);
    fill(png, 1, 0, 255, 0, 0);
    fill(png, 0, 1, 0, 0, 255);
    fill(png, 1, 1, 0, 0, 255);
    const buffer = renderTree(image({ data: PNG.sync.write(png) }), { cols: 1, rows: 1 });
    const cell = buffer.get(0, 0);
    expect(cell?.ch).toBe("▀");
    expect(cell?.fg).toBe("#ff0000");
    expect(cell?.bg).toBe("#0000ff");
  });

  it("paints a checkbox mark", () => {
    const frame = renderFrame(checkbox({ label: "fans", checked: true }), { cols: 20, rows: 1 });
    expect(frame).toContain("[x] fans");
  });
});

describe("input", () => {
  it("parses arrows, ctrl+c, and sgr clicks", () => {
    const parser = new InputParser();
    expect(parser.push("\u001b[A")[0]).toMatchObject({ type: "key", key: { name: "up" } });
    expect(parser.push("\u0003")[0]).toMatchObject({ type: "key", key: { name: "c", ctrl: true } });
    expect(parser.push("\u001b[<0;4;2M")[0]).toMatchObject({ type: "mouse", mouse: { kind: "down", x: 3, y: 1 } });
  });
});

describe("monitor overview", () => {
  it("shows the title, mascot, and gauges", () => {
    const state = initialState();
    state.loading = false;
    state.load = 12;
    state.cpuName = "Test CPU";
    state.hostname = "test-host";
    state.osLabel = "Test OS";
    state.memTotal = 16_000_000_000;
    state.memUsed = 8_000_000_000;
    state.disks = [{ mount: "C:", fs: "NTFS", size: 100, used: 40, use: 40 }];
    const frame = renderFrame(monitorView(state), { cols: 100, rows: 40 });
    expect(frame).toContain("SysTerm");
    expect(frame).toContain("^  ^");
    expect(frame).toContain("CPU");
    expect(frame).toContain("RAM");
  });
});

function rowPair() {
  return row(text("L", { width: "50%" }), text("R", { width: "50%" }));
}

function fill(png: PNG, x: number, y: number, r: number, g: number, b: number): void {
  const index = (png.width * y + x) * 4;
  png.data[index] = r;
  png.data[index + 1] = g;
  png.data[index + 2] = b;
  png.data[index + 3] = 255;
}
