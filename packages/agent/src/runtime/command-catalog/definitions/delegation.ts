import type { CommandCatalogEntry } from "../types";

export const DelegationCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/retry <delegation-task-id>",
    category: "delegation",
    description: "Alias for /delegate retry <delegation-task-id>.",
  },
  {
    command: "/delegate overview",
    category: "delegation",
    description: "Show delegation queue and worker health overview.",
  },
  {
    command: "/delegate workers",
    category: "delegation",
    description: "List delegated workers and worker metadata.",
  },
  {
    command: "/delegate supervise group:browser concurrency:3",
    category: "delegation",
    description: "Supervise queued work with concurrency controls.",
  },
  {
    command:
      "/delegate create Research spike | group:browser | profile:research :: inspect transport drift",
    category: "delegation",
    description: "Create a rich delegated task with metadata.",
  },
];
