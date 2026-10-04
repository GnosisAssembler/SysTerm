#!/usr/bin/env node
import { RingBuffer, run } from "../index.js";
import { createSampler, applySample, type Sample } from "./sampler.js";
import { initialState, nextSort, type MonitorState } from "./state.js";
import { monitorView } from "./ui.js";

const cpuHist = new RingBuffer<number>(60);
const memHist = new RingBuffer<number>(60);
const rxHist = new RingBuffer<number>(60);
const txHist = new RingBuffer<number>(60);

await run<MonitorState>({
  title: "SysTerm",
  fps: 8,
  theme: "mint",
  state: initialState(),
  setup(ctx) {
    return createSampler(
      () => ctx.state.paused,
      (sample) => {
        if (sample.processes) {
          ctx.setState({ processes: sample.processes, loading: false });
          return;
        }
        remember(sample);
        ctx.setState((state) => ({
          ...applySample(state, sample),
          cpuHist: cpuHist.toArray(),
          memHist: memHist.toArray(),
          rxHist: rxHist.toArray(),
          txHist: txHist.toArray(),
        }));
      },
    );
  },
  render(ctx) {
    return monitorView(ctx.state, {
      onView: (view) => ctx.setState({ view }),
      onFilter: (filter) => ctx.setState({ filter }),
      onBlurFilter: () => ctx.focus(null),
      onCloseHelp: () => ctx.setState({ help: false }),
    });
  },
  onKey(key, ctx) {
    if (typing(ctx.focusedKey)) return;
    if (key.name === "q") ctx.exit();
    else if (key.name === "?" || key.printable === "?") ctx.setState((state) => ({ ...state, help: !state.help }));
    else if (key.name === "p") ctx.setState((state) => ({ ...state, paused: !state.paused }));
    else if (key.name === "t") ctx.setTheme(ctx.themeName === "mint" ? "dusk" : "mint");
    else if (key.printable >= "1" && key.printable <= "6") ctx.setState({ view: Number(key.printable) - 1 });
    else if (key.name === "tab") ctx.setState((state) => ({ ...state, view: (state.view + (key.shift ? 5 : 1)) % 6 }));
    else if (key.name === "s") ctx.setState((state) => ({ ...state, sort: nextSort(state.sort) }));
    else if (key.printable === "/") {
      ctx.setState({ view: 4 });
      ctx.focus("filter");
    }
  },
});

function remember(sample: Sample): void {
  if (typeof sample.load === "number") cpuHist.push(sample.load);
  if (typeof sample.memUsed === "number" && typeof sample.memTotal === "number" && sample.memTotal > 0) {
    memHist.push((sample.memUsed / sample.memTotal) * 100);
  }
  if (sample.networkReported && sample.ifaces) {
    const rx = sample.ifaces.reduce((sum, iface) => sum + (iface.rxSec ?? 0), 0);
    const tx = sample.ifaces.reduce((sum, iface) => sum + (iface.txSec ?? 0), 0);
    rxHist.push(rx);
    txHist.push(tx);
  }
}

function typing(focusedKey: string | null): boolean {
  return focusedKey === "key:filter";
}
