export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

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
  source: "doolittle" | "mcp";
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

export interface AcpSessionSummary {
  totalSessions: number;
  recentSessionIds: string[];
  titledSessions: number;
  recentTitles: string[];
}

export interface ToolDefinition {
  id: string;
  name: string;
  category:
    | "workspace"
    | "terminal"
    | "repository"
    | "documents"
    | "gateway"
    | "automation"
    | "mcp"
    | "runtime"
    | "protocol";
  description: string;
  enabled: boolean;
  transport?: "native" | "service" | "adapter";
}
