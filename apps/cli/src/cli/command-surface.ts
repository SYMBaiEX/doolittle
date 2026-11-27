import {
  type CommandCatalogEntry,
  canonicalizeSlashCommandSyntax,
  getCommandCatalogEntries,
  normalizeSlashCommandSyntax,
  rankCommandCatalogEntries,
} from "@doolittle/agent/runtime/command-catalog";

export interface CliHotkeyBinding {
  keys: string[];
  command: string;
  label: string;
}

const HOTKEY_DEFINITIONS: Array<{
  keys: string[];
  command: string;
  label?: string;
}> = [
  { keys: ["f2"], command: "/status" },
  { keys: ["f3"], command: "/tools summary" },
  { keys: ["f4"], command: "/delegate overview" },
  { keys: ["f5"], command: "/gateway readiness" },
  { keys: ["f6"], command: "/sessions list" },
  { keys: ["f7"], command: "/doctor" },
  { keys: ["f8"], command: "/runtime plugins" },
  { keys: ["f9"], command: "/runtime ecosystem" },
  { keys: ["f10"], command: "/gateway history limit:10" },
  { keys: ["f11"], command: "/gateway supervision" },
  { keys: ["f12"], command: "/responses list" },
];

const HELP_EXAMPLES = [
  "/commands",
  "/commands search jobs",
  "/status",
  "/accounts doctor",
  "/jobs start summarize this repo and report back",
  "/todo list",
  "/skills list",
  "/browser capture https://example.com",
  "/delegate create Research spike :: validate a transport path",
  "!git status",
  'doolittle exec -p "review the repo" --json-stream',
];

const CLI_LOCAL_COMMAND_CATALOG_ENTRIES: CommandCatalogEntry[] = [
  {
    command: "/jobs",
    category: "execution",
    description: "List detached background runs and their latest status.",
  },
  {
    command: "/jobs start <prompt>",
    category: "execution",
    description: "Start a detached background run.",
  },
  {
    command: "/jobs show <id>",
    category: "execution",
    description: "Replay the stored output for a background run.",
  },
  {
    command: "/jobs attach <id>",
    category: "execution",
    description: "Follow a running background job live.",
  },
  {
    command: "/jobs cancel <id>",
    category: "execution",
    description: "Cancel a running background job.",
  },
];

const COMMAND_CATEGORY_LABELS: Record<CommandCatalogEntry["category"], string> =
  {
    runtime: "Runtime",
    gateway: "Gateway",
    execution: "Execution",
    memory: "Memory",
    skills: "Skills",
    browser: "Browser",
    media: "Media",
    tools: "Tools",
    delegation: "Delegation",
    research: "Research",
    workspace: "Workspace",
    workflow: "Workflows",
  };

function commandSortKey(command: string): string {
  return canonicalizeSlashCommandSyntax(command);
}

export function getCliCommandCatalogEntries(
  workspaceDir?: string,
): CommandCatalogEntry[] {
  const entries = new Map<string, CommandCatalogEntry>();
  for (const entry of [
    ...getCommandCatalogEntries(workspaceDir),
    ...CLI_LOCAL_COMMAND_CATALOG_ENTRIES,
  ]) {
    const key = commandSortKey(entry.command);
    if (!entries.has(key)) {
      entries.set(key, entry);
    }
  }
  return [...entries.values()];
}

export function rankCliCommandCatalogEntries(
  input: string,
  limit: number,
  workspaceDir?: string,
): CommandCatalogEntry[] {
  return rankCommandCatalogEntries(
    getCliCommandCatalogEntries(workspaceDir),
    input,
    limit,
  );
}

function renderCommandGroup(entries: CommandCatalogEntry[]): string[] {
  const displays = entries.map((entry) =>
    normalizeSlashCommandSyntax(entry.command),
  );
  const commandWidth = Math.min(
    34,
    Math.max(...displays.map((display) => display.length)) + 2,
  );
  return entries.map((entry, index) => {
    const display = displays[index] ?? entry.command;
    return `  ${display.padEnd(commandWidth)}  ${entry.description}`;
  });
}

export function renderCliCommandCatalog(
  query?: string,
  limit = 80,
  workspaceDir?: string,
): string {
  const entries = query?.trim()
    ? rankCliCommandCatalogEntries(query, limit, workspaceDir)
    : getCliCommandCatalogEntries(workspaceDir);
  const groups = new Map<
    CommandCatalogEntry["category"],
    CommandCatalogEntry[]
  >();
  for (const entry of entries) {
    const group = groups.get(entry.category) ?? [];
    group.push(entry);
    groups.set(entry.category, group);
  }

  const lines = [
    query?.trim() ? `Commands matching "${query.trim()}"` : "Command catalog",
  ];
  for (const [category, label] of Object.entries(
    COMMAND_CATEGORY_LABELS,
  ) as Array<[CommandCatalogEntry["category"], string]>) {
    const group = groups.get(category);
    if (!group?.length) {
      continue;
    }
    lines.push("", label, ...renderCommandGroup(group));
  }
  return lines.join("\n");
}

export function getCliHotkeyBindings(): CliHotkeyBinding[] {
  return HOTKEY_DEFINITIONS.map((entry) => {
    const command = canonicalizeSlashCommandSyntax(entry.command);
    return {
      keys: entry.keys,
      command,
      label: entry.label ?? normalizeSlashCommandSyntax(command),
    };
  });
}

export function getCliHelpExamples(): string[] {
  return HELP_EXAMPLES.map((entry) =>
    entry.startsWith("/") ? normalizeSlashCommandSyntax(entry) : entry,
  );
}
