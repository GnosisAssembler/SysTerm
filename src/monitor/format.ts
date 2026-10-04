import { clamp } from "../framework/util.js";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const digits = index === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[index]}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}%`;
}

export function formatRate(value: number | null): string {
  if (value == null) return "not reported";
  return `${formatBytes(value)}/s`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "n/a";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function usageBar(percent: number, width = 8): string {
  const filled = clamp(Math.round((percent / 100) * width), 0, width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}
