import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import * as si from "systeminformation";
import type { DiskRow, IfaceRow, MonitorState, ProcRow } from "./state.js";

const require = createRequire(import.meta.url);

export interface Sample {
  cpuName?: string;
  coreCount?: number;
  speed?: string;
  osLabel?: string;
  hostname?: string;
  gpu?: string;
  uptime?: number;
  battery?: string;
  diskNames?: string;
  load?: number;
  coreLoads?: number[];
  memTotal?: number;
  memUsed?: number;
  memAvailable?: number;
  memCache?: number;
  disks?: DiskRow[];
  processes?: ProcRow[];
  ifaces?: IfaceRow[];
  networkReported?: boolean;
  loading?: boolean;
}

let facts: Sample | null = null;
let processChild: ReturnType<typeof spawn> | null = null;

export function createSampler(paused: () => boolean, push: (sample: Sample) => void): () => void {
  let stopped = false;
  let readingProcesses = false;

  if (process.platform === "win32") {
    try {
      si.powerShellStart();
    } catch {
      // Later calls still work; they just start PowerShell themselves.
    }
  }

  // Process listing runs in its own process so a slow snapshot cannot stall CPU and memory sampling.
  void (async () => {
    await warmup();
    while (!stopped) {
      if (!paused()) {
        const sample = await collectDynamic();
        if (stopped) break;
        push(sample);
        if (!readingProcesses) {
          readingProcesses = true;
          void collectProcesses()
            .then((processes) => {
              if (!stopped && processes) push({ processes });
            })
            .finally(() => {
              readingProcesses = false;
            });
        }
      }
      await delay(1000);
    }
  })();

  return () => {
    stopped = true;
    processChild?.kill();
    if (process.platform === "win32") {
      try {
        si.powerShellRelease();
      } catch {
        // The process is leaving anyway.
      }
    }
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function applySample(state: MonitorState, sample: Sample): MonitorState {
  const next: MonitorState = { ...state, loading: false };
  for (const [key, value] of Object.entries(sample)) {
    if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
  }
  return next;
}

async function warmup(): Promise<void> {
  await Promise.all([
    attempt(si.currentLoad()),
    attempt(si.networkStats()),
  ]);
}

async function collectDynamic(): Promise<Sample> {
  const [cpu, os, graphics, disks] = facts
    ? [null, null, null, null]
    : await Promise.all([
        attempt(si.cpu()),
        attempt(si.osInfo()),
        attempt(si.graphics()),
        attempt(si.diskLayout()),
      ]);
  const [battery, load, memory, filesystems, stats, ifaces] = await Promise.all([
    attempt(si.battery()),
    attempt(si.currentLoad()),
    attempt(si.mem()),
    attempt(si.fsSize()),
    attempt(si.networkStats()),
    attempt(si.networkInterfaces()),
  ]);

  if (!facts && (cpu || os)) {
    const gpu = graphics?.controllers?.map((controller) => controller.model).filter(Boolean).join(", ") ?? "";
    const names = (disks ?? []).map((disk) => disk.name || disk.device).filter(Boolean);
    facts = {
      cpuName: cpu ? `${cpu.manufacturer} ${cpu.brand}`.trim() : "unknown cpu",
      coreCount: cpu?.cores ?? 0,
      speed: cpu?.speed ? `${cpu.speed} GHz` : "",
      osLabel: os ? `${os.distro} ${os.release}`.trim() : "",
      hostname: os?.hostname ?? "",
      gpu,
      diskNames: names.join(", "),
    };
  }

  const clock = safeTime();
  const sample: Sample = {
    ...facts,
    uptime: clock?.uptime ?? 0,
    battery: batteryLabel(battery),
  };
  if (load) {
    sample.load = finite(load.currentLoad);
    sample.coreLoads = (load.cpus ?? []).map((core) => finite(core.load));
  }
  if (memory) {
    sample.memTotal = memory.total;
    sample.memUsed = memory.used;
    sample.memAvailable = memory.available;
    sample.memCache = memory.buffcache;
  }
  if (filesystems) {
    sample.disks = filesystems.map((disk) => ({
      mount: disk.mount || disk.fs || "disk",
      fs: disk.type || disk.fs || "",
      size: disk.size,
      used: disk.used,
      use: finite(disk.use),
    }));
  }
  if (ifaces || stats) {
    const ifaceRows = mergeInterfaces(ifaces ?? [], stats ?? []);
    sample.ifaces = ifaceRows;
    sample.networkReported = ifaceRows.some((row) => row.rxSec != null || row.txSec != null);
  }
  return sample;
}

async function collectProcesses(): Promise<ProcRow[] | null> {
  // A separate process can be killed if the process list hangs, without stalling CPU and memory sampling.
  const modulePath = require.resolve("systeminformation");
  const script = `
    import * as si from ${JSON.stringify(modulePath)};
    const data = await si.processes();
    const list = (data.list ?? []).map((proc) => ({
      pid: proc.pid,
      name: proc.name || "unknown",
      cpu: Number.isFinite(proc.cpu) ? proc.cpu : 0,
      mem: Number.isFinite(proc.mem) ? proc.mem : 0,
    }));
    process.stdout.write(JSON.stringify(list));
  `;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    processChild = child;
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
    }, 8000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      if (processChild === child) processChild = null;
      const start = output.indexOf("[");
      const end = output.lastIndexOf("]");
      if (start < 0 || end < start) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(output.slice(start, end + 1)) as ProcRow[];
        resolve(Array.isArray(parsed) ? parsed : null);
      } catch {
        resolve(null);
      }
    });
  });
}

function mergeInterfaces(ifaces: si.Systeminformation.NetworkInterfacesData[], stats: si.Systeminformation.NetworkStatsData[]): IfaceRow[] {
  const rates = new Map(stats.map((item) => [item.iface, item]));
  const visible = ifaces.filter((item) => !item.internal);
  const source = visible.length ? visible : ifaces;
  return source.map((item) => {
    const rate = rates.get(item.iface);
    return {
      iface: item.iface,
      ip4: item.ip4 || "",
      rxSec: optionalRate(rate?.rx_sec),
      txSec: optionalRate(rate?.tx_sec),
    };
  });
}

function batteryLabel(battery: si.Systeminformation.BatteryData | null): string {
  if (!battery?.hasBattery) return "";
  const state = battery.isCharging || battery.acConnected ? "charging" : "on battery";
  const percent = Number.isFinite(battery.percent) ? `${Math.round(battery.percent)}%` : "n/a";
  return `${percent} ${state}`;
}

function safeTime(): si.Systeminformation.TimeData | null {
  try {
    return si.time();
  } catch {
    return null;
  }
}

function optionalRate(value: number | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function finite(value: number | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

function attempt<T>(promise: Promise<T>): Promise<T | null> {
  return promise.then((value) => value, () => null);
}
