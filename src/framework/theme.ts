import type { ColorMode, Theme, ThemeName } from "./types.js";

export const themes: Record<ThemeName, Theme> = {
  mint: {
    name: "mint",
    bg: "#0e1a17",
    fg: "#d7f5e8",
    muted: "#7aa894",
    accent: "#3ee0a0",
    warn: "#ffcc66",
    hot: "#ff6b6b",
    border: "#1f6f56",
    selection: "#14352c",
    panel: "#10211c",
  },
  dusk: {
    name: "dusk",
    bg: "#16141f",
    fg: "#f3e9ff",
    muted: "#a894c4",
    accent: "#d28bff",
    warn: "#ffcc66",
    hot: "#ff6b8a",
    border: "#5c4578",
    selection: "#2a2238",
    panel: "#1c1828",
  },
};

export function themeByName(name: ThemeName): Theme {
  return themes[name];
}

export function detectColorMode(env: NodeJS.ProcessEnv = process.env): ColorMode {
  const colorterm = env.COLORTERM ?? "";
  const term = env.TERM ?? "";
  if (env.WT_SESSION || /truecolor|24bit/i.test(colorterm)) return "truecolor";
  if (term.includes("256color")) return "256";
  return "16";
}
