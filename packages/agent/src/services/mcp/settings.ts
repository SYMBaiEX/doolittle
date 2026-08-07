import { parse } from "shell-quote";

export interface StdioMcpServerConfig {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  timeoutInMillis?: number;
}

export interface RemoteMcpServerConfig {
  type: "http" | "streamable-http" | "sse";
  url: string;
  timeout?: number;
}

export type McpServerConfig = StdioMcpServerConfig | RemoteMcpServerConfig;

/** Canonical Eliza MCP plugin settings persisted by Doolittle. */
export interface ElizaMcpSettings {
  servers: Record<string, McpServerConfig>;
  maxRetries: number;
}

export interface LegacyMcpSettings {
  serverCommand?: string;
  timeoutMs?: number;
}

export const DEFAULT_MCP_SERVER_NAME = "doolittle";
export const DEFAULT_MCP_MAX_RETRIES = 2;

export function createElizaMcpSettingsFromCommand(
  commandLine: string | undefined,
  timeoutMs: number,
): ElizaMcpSettings {
  const trimmed = commandLine?.trim();
  if (!trimmed) {
    return { servers: {}, maxRetries: DEFAULT_MCP_MAX_RETRIES };
  }

  const tokens = parse(trimmed);
  if (!tokens.length || tokens.some((token) => typeof token !== "string")) {
    throw new Error(
      "MCP server commands must contain one executable and plain arguments; shell operators are not supported.",
    );
  }

  const [command, ...args] = tokens as string[];
  if (!command) {
    return { servers: {}, maxRetries: DEFAULT_MCP_MAX_RETRIES };
  }

  return {
    servers: {
      [DEFAULT_MCP_SERVER_NAME]: {
        type: "stdio",
        command,
        ...(args.length ? { args } : {}),
        timeoutInMillis: timeoutMs,
      },
    },
    maxRetries: DEFAULT_MCP_MAX_RETRIES,
  };
}

export function isElizaMcpSettings(value: unknown): value is ElizaMcpSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ElizaMcpSettings>;
  return (
    Boolean(candidate.servers) &&
    typeof candidate.servers === "object" &&
    !Array.isArray(candidate.servers)
  );
}
