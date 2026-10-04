import figlet from "figlet";
import { widthOf } from "./util.js";

const FONTS = ["Small", "Mini", "Standard"] as const;
const cache = new Map<string, string>();

export function fitFiglet(label: string, width: number): string {
  if (width <= 0) return "";
  const key = `${width}:${label}`;
  const cached = cache.get(key);
  if (cached != null) return cached;
  let chosen = label;
  for (const font of FONTS) {
    try {
      const art = figlet.textSync(label, { font, horizontalLayout: "fitted" }).replace(/\s+$/g, "");
      const widest = Math.max(0, ...art.split("\n").map((line) => widthOf(line)));
      if (widest > 0 && widest <= width) {
        chosen = art;
        break;
      }
    } catch {
      // The next font, or the plain label, still draws a title.
    }
  }
  cache.set(key, chosen);
  return chosen;
}
