import { asArray, asNumber, asRecord, asString } from "../../lib";

export interface McpToolSummary {
  name: string;
  description: string;
  inputCount: number;
}

export interface McpMarketplaceSummary {
  name: string;
  title: string;
  description: string;
  version: string;
  connectionType: string;
  repositoryUrl: string;
  isLatest: boolean;
}

export interface McpMarketplaceRequirement {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
}

export interface McpMarketplaceDetail {
  name: string;
  version: string;
  repositoryUrl: string;
  transports: string[];
  environment: McpMarketplaceRequirement[];
  headers: McpMarketplaceRequirement[];
  config: unknown;
}

export interface McpStatus {
  enabled?: boolean;
  detail?: string;
  serverCount?: number;
  connectedServers?: number;
  failedServers?: number;
  servers?: unknown[];
  discoveredTools?: number;
  lastProbeAt?: string;
  lastDiscoveryAt?: string;
  lastError?: string;
}

export interface McpServerSummary {
  name: string;
  status: string;
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
  error: string;
}

export function normalizeMcpTools(value: unknown): McpToolSummary[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        description: asString(
          record.description,
          "No description provided by this MCP server.",
        ),
        inputCount: Object.keys(
          asRecord(asRecord(record.inputSchema).properties),
        ).length,
      };
    })
    .filter((tool): tool is McpToolSummary => tool !== null);
}

export function normalizeMcpServers(value: unknown): McpServerSummary[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        status: asString(record.status, "unknown"),
        toolCount: asNumber(record.toolCount, 0),
        resourceCount: asNumber(record.resourceCount, 0),
        resourceTemplateCount: asNumber(record.resourceTemplateCount, 0),
        error: asString(record.error),
      };
    })
    .filter((server): server is McpServerSummary => server !== null);
}

export function normalizeMcpMarketplace(
  value: unknown,
): McpMarketplaceSummary[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        title: asString(record.title, name),
        description: asString(record.description, "No description provided."),
        version: asString(record.version, "Unknown"),
        connectionType: asString(record.connectionType, "unknown"),
        repositoryUrl: safeHttpUrl(record.repositoryUrl),
        isLatest: record.isLatest === true,
      };
    })
    .filter((server): server is McpMarketplaceSummary => server !== null);
}

function normalizeRequirements(value: unknown): McpMarketplaceRequirement[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      const name = asString(record.name).trim();
      if (!name) return null;
      return {
        name,
        description: asString(record.description),
        required: record.isRequired === true,
        secret: record.isSecret === true,
      };
    })
    .filter((item): item is McpMarketplaceRequirement => item !== null);
}

export function normalizeMcpMarketplaceDetail(
  server: unknown,
  config: unknown,
): McpMarketplaceDetail | undefined {
  const record = asRecord(server);
  const name = asString(record.name).trim();
  if (!name) return undefined;
  const remotes = asArray(record.remotes).map(asRecord);
  const packages = asArray(record.packages).map(asRecord);
  return {
    name,
    version: asString(record.version, "Unknown"),
    repositoryUrl: safeHttpUrl(asRecord(record.repository).url),
    transports: [
      ...remotes.map((remote) => asString(remote.type, "streamable-http")),
      ...packages.map((entry) =>
        asString(asRecord(entry.transport).type, "stdio"),
      ),
    ].filter(Boolean),
    environment: packages.flatMap((entry) =>
      normalizeRequirements(entry.environmentVariables),
    ),
    headers: remotes.flatMap((remote) => normalizeRequirements(remote.headers)),
    config,
  };
}

function safeHttpUrl(value: unknown): string {
  const url = asString(value).trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

export function mcpStatusLabel(status: McpStatus | undefined): string {
  if (!status) return "Checking";
  if (!status.enabled) return "Not configured";
  if (asNumber(status.failedServers, 0) > 0) return "Needs attention";
  return asNumber(status.connectedServers, 0) ===
    asNumber(status.serverCount, 0)
    ? "Connected"
    : "Connecting";
}

export function mcpLiveStatus(
  status: McpStatus | undefined,
  toolCount: number,
  selectedToolName = "",
  selectedMarketplaceName = "",
): string {
  if (!status) return "Checking MCP connections.";
  const summary = [
    `MCP ${mcpStatusLabel(status).toLowerCase()}.`,
    `${asNumber(status.connectedServers, 0)} of ${asNumber(status.serverCount, 0)} servers connected.`,
    `${toolCount} cached tool${toolCount === 1 ? "" : "s"}.`,
  ];
  if (selectedToolName)
    summary.push(`Tool details selected: ${selectedToolName}.`);
  if (selectedMarketplaceName)
    summary.push(`Registry definition selected: ${selectedMarketplaceName}.`);
  return summary.join(" ");
}
