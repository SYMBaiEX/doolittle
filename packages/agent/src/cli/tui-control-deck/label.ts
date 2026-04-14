import type { ControlDeckMode } from "./types";

export function controlDeckLabel(mode: ControlDeckMode): string {
  switch (mode) {
    case "ecosystem":
      return " Control Deck · Ecosystem ";
    case "gateway":
      return " Control Deck · Gateway ";
    case "jobs":
      return " Control Deck · Jobs ";
    case "responses":
      return " Control Deck · Responses ";
    default:
      return " Control Deck · Assist ";
  }
}
