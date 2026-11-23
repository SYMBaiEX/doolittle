import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";

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

const RUNTIME_ACTION_KINDS: Readonly<Record<string, AcpToolKind>> = {
  READ: "read",
  READ_FILE: "read",
  EDIT: "edit",
  WRITE: "edit",
  WRITE_FILE: "edit",
  PATCH_FILE: "edit",
  CREATE_DIRECTORY: "edit",
  SEARCH_FILES: "search",
  WEB_SEARCH: "search",
  DOOLITTLE_SESSION_SEARCH: "search",
  SHELL: "execute",
  WEB_FETCH: "fetch",
  BROWSER: "fetch",
  TASKS: "think",
};

/** Classify an ElizaOS runtime action name (e.g. `SHELL`) for ACP tool calls. */
export function acpToolKindForAction(action: string): AcpToolKind {
  const name = action.trim();
  return (
    RUNTIME_ACTION_KINDS[name.toUpperCase()] ??
    guessAcpToolKind({ id: name.toLowerCase() })
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

function buildWindowsAcpDistribution(
  command: string,
): AcpRegistryEntry["distribution"] {
  const quotePowerShellLiteral = (value: string) =>
    `'${value.replace(/['‘’‚‛]/gu, "$&$&")}'`;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$start = New-Object System.Diagnostics.ProcessStartInfo",
    "$start.FileName = if ($env:ComSpec) { $env:ComSpec } else { 'cmd.exe' }",
    `$start.Arguments = ${quotePowerShellLiteral(`/D /S /C "${command}"`)}`,
    "$start.UseShellExecute = $false",
    "$child = [System.Diagnostics.Process]::Start($start)",
    "$child.WaitForExit()",
    "exit $child.ExitCode",
  ].join("\n");
  return {
    type: "command",
    command: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
  };
}

function buildAcpDistribution(
  command?: string,
): AcpRegistryEntry["distribution"] {
  if (!command) return { type: "command", command: "doolittle", args: ["acp"] };
  if (process.platform === "win32") {
    return buildWindowsAcpDistribution(command);
  }
  return {
    type: "command",
    command: existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/sh",
    args: ["-lc", command],
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
    distribution: buildAcpDistribution(input.command),
    capabilities: {
      tools: input.toolCount,
      sessions: true,
      import_export: true,
      editors: ["zed", "cursor", "vscode"],
    },
  };
}

function defaultAcpInstallCommand(): string {
  return process.platform === "win32"
    ? "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install.ps1"
    : "bash scripts/install.sh";
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
    installCommand: input.installCommand ?? defaultAcpInstallCommand(),
    exportCommand:
      input.exportCommand ?? "POST /acp/export or /acp export [label]",
    importCommand:
      input.importCommand ?? "POST /acp/import or /acp import <path|json>",
    lastPublishAt: input.lastPublishAt,
    lastExportAt: input.lastExportAt,
    lastImportAt: input.lastImportAt,
  };
}
