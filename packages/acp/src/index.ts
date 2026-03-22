export type AcpToolKind =
  | "read"
  | "edit"
  | "search"
  | "execute"
  | "fetch"
  | "think"
  | "other";

export interface AcpToolDefinition {
  name: string;
  description: string;
  kind: AcpToolKind;
  inputSchema?: Record<string, unknown>;
  source: "eliza-agent" | "mcp";
}

export interface AcpRegistryEntry {
  schema_version: number;
  name: string;
  display_name: string;
  description: string;
  package: {
    name: string;
    version: string;
  };
  distribution: {
    type: "command";
    command: string;
    args: string[];
  };
  capabilities: {
    tools: number;
    sessions?: boolean;
    import_export?: boolean;
    editors?: string[];
  };
}

export interface AcpPackageMetadata {
  name: string;
  version: string;
  description?: string;
  packageManager?: string;
  workspaceCount: number;
  pluginPackageCount: number;
  rootPath: string;
}

export interface AcpEditorSummary {
  package: AcpPackageMetadata;
  registryPath: string;
  exportDir: string;
  importDir: string;
  commandConfigured: boolean;
  command?: string;
  installCommand: string;
  exportCommand: string;
  importCommand: string;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
}

export interface AcpBundlePayload {
  exportedAt: string;
  label: string;
  package: AcpPackageMetadata;
  status: unknown;
  editor: AcpEditorSummary;
  registry: AcpRegistryEntry;
  sessions: unknown;
  tools: AcpToolDefinition[];
}

export function guessAcpToolKind(tool: { id: string }): AcpToolKind {
  if (
    tool.id.startsWith("workspace.read") ||
    tool.id.startsWith("browser.snapshot")
  ) {
    return "read";
  }
  if (
    tool.id.startsWith("workspace.write") ||
    tool.id.startsWith("gateway.edit") ||
    tool.id.startsWith("browser.compare")
  ) {
    return "edit";
  }
  if (
    tool.id.startsWith("workspace.search") ||
    tool.id.startsWith("mcp") ||
    tool.id.startsWith("acp")
  ) {
    return "search";
  }
  if (
    tool.id.startsWith("terminal.run") ||
    tool.id.startsWith("repository") ||
    tool.id.startsWith("gateway.send") ||
    tool.id.startsWith("media.generate") ||
    tool.id.startsWith("media.speak")
  ) {
    return "execute";
  }
  if (
    tool.id.startsWith("web.") ||
    tool.id.startsWith("browser.") ||
    tool.id.startsWith("documents.")
  ) {
    return "fetch";
  }
  if (tool.id.startsWith("automation.") || tool.id.startsWith("delegate")) {
    return "think";
  }
  return "other";
}

export function buildAcpPackageMetadata(input: {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  packageManager?: unknown;
  workspaceCount: number;
  pluginPackageCount: number;
  rootPath: string;
}): AcpPackageMetadata {
  return {
    name: typeof input.name === "string" ? input.name : "eliza-agent",
    version: typeof input.version === "string" ? input.version : "0.0.0",
    description:
      typeof input.description === "string" ? input.description : undefined,
    packageManager:
      typeof input.packageManager === "string"
        ? input.packageManager
        : undefined,
    workspaceCount: input.workspaceCount,
    pluginPackageCount: input.pluginPackageCount,
    rootPath: input.rootPath,
  };
}

export function buildAcpRegistryEntry(input: {
  agentName: string;
  description: string;
  package: AcpPackageMetadata;
  command?: string;
  toolCount: number;
}): AcpRegistryEntry {
  return {
    schema_version: 1,
    name: "eliza-agent",
    display_name: input.agentName,
    description: input.description,
    package: {
      name: input.package.name,
      version: input.package.version,
    },
    distribution: input.command
      ? {
          type: "command",
          command: "/bin/zsh",
          args: ["-lc", input.command],
        }
      : {
          type: "command",
          command: "bun",
          args: ["run", "start", "--cli"],
        },
    capabilities: {
      tools: input.toolCount,
      sessions: true,
      import_export: true,
      editors: ["zed", "cursor", "vscode"],
    },
  };
}

export function buildAcpEditorSummary(input: {
  package: AcpPackageMetadata;
  registryPath: string;
  exportDir: string;
  importDir: string;
  commandConfigured: boolean;
  command?: string;
  installCommand?: string;
  exportCommand?: string;
  importCommand?: string;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
}): AcpEditorSummary {
  return {
    package: input.package,
    registryPath: input.registryPath,
    exportDir: input.exportDir,
    importDir: input.importDir,
    commandConfigured: input.commandConfigured,
    command: input.command,
    installCommand:
      input.installCommand ?? "bun install && bun run start -- --cli",
    exportCommand:
      input.exportCommand ?? "POST /acp/export or /acp export [label]",
    importCommand:
      input.importCommand ?? "POST /acp/import or /acp import <path|json>",
    lastPublishAt: input.lastPublishAt,
    lastExportAt: input.lastExportAt,
    lastImportAt: input.lastImportAt,
  };
}

export function buildAcpBundlePayload(input: {
  exportedAt: string;
  label: string;
  package: AcpPackageMetadata;
  status: unknown;
  editor: AcpEditorSummary;
  registry: AcpRegistryEntry;
  sessions: unknown;
  tools: AcpToolDefinition[];
}): AcpBundlePayload {
  return input;
}
