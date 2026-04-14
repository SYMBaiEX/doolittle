import type { CommandCatalogEntry } from "../../types";

export function runtimeCommand(
  command: string,
  description: string,
): CommandCatalogEntry {
  return {
    command,
    category: "runtime",
    description,
  };
}
