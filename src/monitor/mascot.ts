export type Mood = "calm" | "busy" | "hot";

export function moodFromLoad(load: number): Mood {
  if (load >= 85) return "hot";
  if (load >= 50) return "busy";
  return "calm";
}

export function mascotArt(mood: Mood): string {
  const face = mood === "hot" ? "  / >  < \\" : mood === "busy" ? "  / o  o \\" : "  / ^  ^ \\";
  return ["   .----.", face, "  |  ..  |", "   \\ -- /", "    |  |"].join("\n");
}

export function moodLabel(mood: Mood): string {
  if (mood === "hot") return "Bit is melting";
  if (mood === "busy") return "Bit is hustling";
  return "Bit is cozy";
}
