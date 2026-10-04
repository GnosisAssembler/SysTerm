import {
  ascii,
  banner,
  barChart,
  column,
  gauge,
  heatmap,
  lineChart,
  modal,
  panel,
  row,
  scroll,
  sparkline,
  table,
  tabs,
  text,
  textInput,
  type VNode,
} from "../index.js";
import { formatBytes, formatPercent, formatRate, formatUptime, usageBar } from "./format.js";
import { mascotArt, moodFromLoad, moodLabel } from "./mascot.js";
import { sortProcesses, type MonitorState } from "./state.js";

const VIEWS = ["Overview", "CPU", "Memory", "Disks", "Processes", "Network"];

export interface MonitorHandlers {
  onView?: (index: number) => void;
  onFilter?: (value: string) => void;
  onBlurFilter?: () => void;
  onCloseHelp?: () => void;
}

export function monitorView(state: MonitorState, handlers: MonitorHandlers = {}): VNode {
  const mood = moodFromLoad(state.load);
  const processView = state.view === 4;
  return column(
    row(
      { height: 7 },
      column(
        { flexGrow: 1 },
        banner("SysTerm"),
        text(`${moodLabel(mood)}  ·  ${state.cpuName}`, { tone: "muted" }),
      ),
      ascii(mascotArt(mood), { width: 16 }),
    ),
    tabs({
      key: "views",
      tabs: VIEWS,
      selected: state.view,
      onSelect: handlers.onView,
    }),
    processView ? processPage(state, handlers) : scroll({ key: "page", flexGrow: 1, autofocus: true }, page(state)),
    text(footerLine(state), { tone: state.paused ? "hot" : "muted", nowrap: true }),
    state.help ? helpModal(handlers) : null,
  );
}

function page(state: MonitorState): VNode {
  if (state.view === 1) return cpuPage(state);
  if (state.view === 2) return memoryPage(state);
  if (state.view === 3) return diskPage(state);
  if (state.view === 5) return networkPage(state);
  return overviewPage(state);
}

function overviewPage(state: MonitorState): VNode {
  const memPercent = state.memTotal > 0 ? (state.memUsed / state.memTotal) * 100 : 0;
  return column(
    state.loading ? text("sniffing the machine...", { tone: "muted" }) : null,
    row(
      panel(
        { title: "cpu", flexGrow: 1 },
        gauge({ label: "CPU", value: state.load, max: 100 }),
        sparkline({ data: state.cpuHist, min: 0, max: 100 }),
      ),
      panel(
        { title: "memory", flexGrow: 1 },
        gauge({ label: "RAM", value: memPercent, max: 100 }),
        sparkline({ data: state.memHist, min: 0, max: 100 }),
      ),
    ),
    panel(
      { title: "disks" },
      state.disks.length
        ? barChart({
            items: state.disks.slice(0, 6).map((disk) => ({ label: disk.mount, value: disk.use, max: 100 })),
          })
        : text("disk usage is not reported", { tone: "muted" }),
    ),
    text(summary(state), { tone: "muted", nowrap: true }),
  );
}

function cpuPage(state: MonitorState): VNode {
  return column(
    text([state.cpuName, state.coreCount ? `${state.coreCount} threads` : "", state.speed].filter(Boolean).join("   "), { tone: "muted" }),
    state.coreLoads.length
      ? barChart({ items: state.coreLoads.map((load, index) => ({ label: `c${index}`, value: load, max: 100 })) })
      : text("per-core load is not reported", { tone: "muted" }),
    state.coreLoads.length ? heatmap({ values: [state.coreLoads], min: 0, max: 100, height: 1 }) : null,
    text("load history", { tone: "muted" }),
    lineChart({ data: state.cpuHist, min: 0, max: 100, height: 10 }),
  );
}

function memoryPage(state: MonitorState): VNode {
  const cacheKnown = state.memCache > 0 || process.platform !== "win32";
  return column(
    text(`${formatBytes(state.memUsed)} used of ${formatBytes(state.memTotal)}`, { tone: "muted" }),
    barChart({
      items: [
        { label: "used", value: state.memUsed, max: Math.max(state.memTotal, 1) },
        { label: "free", value: state.memAvailable, max: Math.max(state.memTotal, 1) },
        ...(cacheKnown ? [{ label: "cache", value: state.memCache, max: Math.max(state.memTotal, 1) }] : []),
      ],
    }),
    cacheKnown ? null : text("cache is not reported on this system", { tone: "muted" }),
    text("used history", { tone: "muted" }),
    lineChart({ data: state.memHist, min: 0, max: 100, height: 10 }),
  );
}

function diskPage(state: MonitorState): VNode {
  return column(
    state.diskNames ? text(state.diskNames, { tone: "muted" }) : null,
    table({
      key: "disks",
      columns: [
        { key: "mount", title: "mount", width: 16 },
        { key: "size", title: "size", width: 12, align: "right" },
        { key: "used", title: "used" },
      ],
      rows: state.disks.map((disk) => ({
        mount: disk.mount,
        size: formatBytes(disk.size),
        used: `${usageBar(disk.use)} ${formatPercent(disk.use)}`,
      })),
      empty: "disk usage is not reported",
    }),
  );
}

function processPage(state: MonitorState, handlers: MonitorHandlers): VNode {
  const rows = sortProcesses(state.processes, state.sort, state.filter);
  return column(
    { flexGrow: 1 },
    textInput({
      key: "filter",
      value: state.filter,
      placeholder: "filter name or pid",
      onChange: handlers.onFilter,
      onSubmit: handlers.onBlurFilter,
      onCancel: () => {
        handlers.onFilter?.("");
        handlers.onBlurFilter?.();
      },
    }),
    text(`${rows.length} shown · sort ${state.sort} · s cycles sort`, { tone: "muted" }),
    table({
      key: "procs",
      flexGrow: 1,
      autofocus: true,
      columns: [
        { key: "pid", title: "pid", width: 8, align: "right" },
        { key: "name", title: "name" },
        { key: "cpu", title: state.sort === "cpu" ? "cpu*" : "cpu", width: 8, align: "right" },
        { key: "mem", title: state.sort === "mem" ? "mem*" : "mem", width: 8, align: "right" },
      ],
      rows: rows.map((proc) => ({
        pid: String(proc.pid),
        name: proc.name,
        cpu: proc.cpu.toFixed(1),
        mem: proc.mem.toFixed(1),
      })),
      empty: "no matching processes",
    }),
  );
}

function networkPage(state: MonitorState): VNode {
  return column(
    state.networkReported ? null : text("transfer rates are not reported yet", { tone: "muted" }),
    text("receive", { tone: "muted" }),
    sparkline({ data: state.rxHist }),
    text("send", { tone: "muted" }),
    sparkline({ data: state.txHist }),
    table({
      key: "net",
      columns: [
        { key: "iface", title: "iface", width: 16 },
        { key: "ip", title: "address", width: 16 },
        { key: "rx", title: "rx", width: 14, align: "right" },
        { key: "tx", title: "tx", width: 14, align: "right" },
      ],
      rows: state.ifaces.map((iface) => ({
        iface: iface.iface,
        ip: iface.ip4 || "—",
        rx: formatRate(iface.rxSec),
        tx: formatRate(iface.txSec),
      })),
      empty: "no interfaces reported",
    }),
  );
}

function helpModal(handlers: MonitorHandlers): VNode {
  return modal(
    { key: "help", title: "help", width: 52, height: 16, onClose: handlers.onCloseHelp },
    text("1-6 or tab     switch the view"),
    text("j k or arrows  scroll, or move in a list"),
    text("/              filter processes"),
    text("s              cycle the process sort"),
    text("p              pause sampling"),
    text("t              swap mint and dusk"),
    text("esc or ?       close this card"),
    text("q              quit"),
    text("Bit watches the machine with you.", { tone: "muted" }),
  );
}

function footerLine(state: MonitorState): string {
  const stateLabel = state.paused ? "paused" : "live";
  return `SysTerm  ${stateLabel}  q quit  ? help  t theme  p pause  / filter`;
}

function summary(state: MonitorState): string {
  const parts = [
    state.osLabel,
    state.hostname,
    state.gpu,
    state.uptime ? `up ${formatUptime(state.uptime)}` : "",
    state.battery,
    state.diskNames,
  ].filter(Boolean);
  return parts.join("  ·  ");
}
