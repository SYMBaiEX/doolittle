import type { CommandCatalogEntry } from "../types";

export const ExecutionCommandCatalogEntries: CommandCatalogEntry[] = [
  {
    command: "/approvals",
    category: "execution",
    description:
      "List pending and recent remote execution approvals for shell commands.",
  },
  {
    command: "/approvals list [pending|approved|denied|used|expired]",
    category: "execution",
    description:
      "Filter remote execution approvals by status for review or troubleshooting.",
  },
  {
    command: "/approvals approve <id>",
    category: "execution",
    description:
      "Approve a pending remote shell command and execute it immediately.",
  },
  {
    command: "/approve <id>",
    category: "execution",
    description:
      "Short alias for approving and executing a pending remote shell command.",
  },
  {
    command: "/approvals deny <id>",
    category: "execution",
    description: "Deny a pending remote shell command without running it.",
  },
  {
    command: "/deny <id>",
    category: "execution",
    description:
      "Short alias for denying a pending remote shell command without running it.",
  },
  {
    command: "/execution status",
    category: "execution",
    description: "Show health and readiness for all execution backends.",
  },
  {
    command: "/execution preview <command>",
    category: "execution",
    description: "Preview backend execution without running it.",
  },
  {
    command: "/terminal run <command>",
    category: "execution",
    description: "Run a command through the active execution backend.",
  },
];
