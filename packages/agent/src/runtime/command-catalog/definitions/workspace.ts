import type { CommandCatalogEntry } from "../types";

export const WorkspaceCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/repo status",
    category: "workspace",
    description: "Show git status for the active workspace.",
  },
  {
    command: "/workspace tree",
    category: "workspace",
    description: "List files in the active workspace.",
  },
];
