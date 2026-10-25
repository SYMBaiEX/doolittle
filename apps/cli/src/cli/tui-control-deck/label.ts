import type { ControlDeckMode } from "./types";

export function controlDeckLabel(mode: ControlDeckMode): string {
  switch (mode) {
    case "ecosystem":
      return " Ecosystem ";
    case "gateway":
      return " Gateway ";
    case "jobs":
      return " Jobs ";
    case "responses":
      return " Responses ";
    default:
      return " Commands ";
  }
}
