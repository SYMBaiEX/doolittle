import type { MediaInspection } from "../types";

export function inferMediaAnalysisFocus(
  focus: "auto" | "voice" | "vision" | "research",
  inspection: MediaInspection,
): "voice" | "vision" | "research" {
  if (focus !== "auto") {
    return focus;
  }

  if (inspection.kind === "audio" || inspection.kind === "video") {
    return "voice";
  }

  if (inspection.kind === "image") {
    return "vision";
  }

  return "research";
}
