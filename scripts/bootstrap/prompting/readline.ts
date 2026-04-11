import type { createInterface } from "node:readline/promises";
import type { PromptHandle } from "./types";

export function requireReadline(
  rl: PromptHandle,
): ReturnType<typeof createInterface> {
  if (!rl) {
    throw new Error("Interactive readline is unavailable.");
  }
  return rl;
}
