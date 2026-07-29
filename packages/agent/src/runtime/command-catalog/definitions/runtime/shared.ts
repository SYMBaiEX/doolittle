import type { CommandCatalogEntry } from "../../types";

export function runtimeCommand(
  command: string,
  description: string,
  aliases?: string[],
): CommandCatalogEntry {
  return {
    command,
    category: "runtime",
    description,
    aliases,
  };
}
