import type { CommandCatalogEntry } from "../types";

export const BrowserCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/browser status",
    category: "browser",
    description: "Show browser backend status and provider details.",
  },
  {
    command: "/browser capture <url>",
    category: "browser",
    description: "Create a capture bundle with snapshots and reports.",
  },
  {
    command: "/browser compare <left> :: <right>",
    category: "browser",
    description: "Compare two pages and produce a comparison bundle.",
  },
];
