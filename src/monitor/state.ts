export interface DiskRow {
  mount: string;
  fs: string;
  size: number;
  used: number;
  use: number;
}

export interface ProcRow {
  pid: number;
  name: string;
  cpu: number;
  mem: number;
}

export interface IfaceRow {
  iface: string;
  ip4: string;
  rxSec: number | null;
  txSec: number | null;
}

export type SortKey = "cpu" | "mem" | "name" | "pid";

export interface MonitorState {
  view: number;
  paused: boolean;
  help: boolean;
  filter: string;
  sort: SortKey;
  loading: boolean;
  cpuName: string;
  coreCount: number;
  speed: string;
  osLabel: string;
  hostname: string;
  gpu: string;
  uptime: number;
  battery: string;
  diskNames: string;
  load: number;
  coreLoads: number[];
  memTotal: number;
  memUsed: number;
  memAvailable: number;
  memCache: number;
  disks: DiskRow[];
  processes: ProcRow[];
  ifaces: IfaceRow[];
  cpuHist: number[];
  memHist: number[];
  rxHist: number[];
  txHist: number[];
  networkReported: boolean;
}

export function initialState(): MonitorState {
  return {
    view: 0,
    paused: false,
    help: false,
    filter: "",
    sort: "cpu",
    loading: true,
    cpuName: "reading cpu...",
    coreCount: 0,
    speed: "",
    osLabel: "",
    hostname: "",
    gpu: "",
    uptime: 0,
    battery: "",
    diskNames: "",
    load: 0,
    coreLoads: [],
    memTotal: 0,
    memUsed: 0,
    memAvailable: 0,
    memCache: 0,
    disks: [],
    processes: [],
    ifaces: [],
    cpuHist: [],
    memHist: [],
    rxHist: [],
    txHist: [],
    networkReported: false,
  };
}

const SORTS: SortKey[] = ["cpu", "mem", "name", "pid"];

export function nextSort(sort: SortKey): SortKey {
  return SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length] ?? "cpu";
}

export function sortProcesses(list: ProcRow[], sort: SortKey, filter: string): ProcRow[] {
  const query = filter.trim().toLowerCase();
  const filtered = query
    ? list.filter((proc) => proc.name.toLowerCase().includes(query) || String(proc.pid).includes(query))
    : list;
  return filtered.slice().sort((a, b) => {
    if (sort === "cpu" || sort === "mem") {
      const idleA = a.pid === 0;
      const idleB = b.pid === 0;
      if (idleA !== idleB) return idleA ? 1 : -1;
    }
    if (sort === "name") return a.name.localeCompare(b.name) || a.pid - b.pid;
    if (sort === "pid") return a.pid - b.pid;
    if (sort === "mem") return b.mem - a.mem || b.cpu - a.cpu;
    return b.cpu - a.cpu || b.mem - a.mem;
  });
}
