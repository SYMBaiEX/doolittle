export type AcpToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
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
  source: "doolittle" | "mcp";
}

export interface AcpRegistryEntry {
  schema_version: number;
  name: string;
  display_name: string;
  description: string;
  package: { name: string; version: string };
  distribution: { type: "command"; command: string; args: string[] };
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

const TOOL_KIND_PREFIXES: ReadonlyArray<
  readonly [AcpToolKind, readonly string[]]
> = [
  ["read", ["workspace.read", "browser.snapshot"]],
  ["edit", ["workspace.write", "gateway.edit", "browser.compare"]],
  ["search", ["workspace.search", "mcp", "acp"]],
  [
    "execute",
    [
      "terminal.run",
      "repository",
      "gateway.send",
      "media.generate",
      "media.speak",
    ],
  ],
  ["fetch", ["web.", "browser.", "documents."]],
  ["think", ["automation.", "delegate"]],
];

export function guessAcpToolKind(tool: { id: string }): AcpToolKind {
  return (
    TOOL_KIND_PREFIXES.find(([, prefixes]) =>
      prefixes.some((prefix) => tool.id.startsWith(prefix)),
    )?.[0] ?? "other"
  );
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
    name: typeof input.name === "string" ? input.name : "doolittle",
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
    name: "doolittle",
    display_name: input.agentName,
    description: input.description,
    package: { name: input.package.name, version: input.package.version },
    distribution: input.command
      ? { type: "command", command: "/bin/zsh", args: ["-lc", input.command] }
      : { type: "command", command: "doolittle", args: ["acp"] },
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
    installCommand: input.installCommand ?? "nub install && nub run start",
    exportCommand:
      input.exportCommand ?? "POST /acp/export or /acp export [label]",
    importCommand:
      input.importCommand ?? "POST /acp/import or /acp import <path|json>",
    lastPublishAt: input.lastPublishAt,
    lastExportAt: input.lastExportAt,
    lastImportAt: input.lastImportAt,
  };
}

export function buildAcpBundlePayload(
  input: AcpBundlePayload,
): AcpBundlePayload {
  return input;
}
