import type { DiagnosticCheck } from "@/types";
import type {
  DiagnosticsCheckBuilder,
  DiagnosticsExecutionChecksInput,
} from "./types";

export const buildExecutionBasicsChecks: DiagnosticsCheckBuilder<
  DiagnosticsExecutionChecksInput
> = ({ config }): DiagnosticCheck[] => [
  {
    id: "execution.remote.sync",
    status: config.remoteSyncInclude.length > 0 ? "pass" : "warn",
    summary: "Remote workspace sync planning",
    detail: `Mode=${config.remoteSyncMode}; include=${config.remoteSyncInclude.join(", ") || "none"}; exclude=${config.remoteSyncExclude.join(", ") || "none"}; workspace label=${config.remoteWorkspaceLabel}.`,
  },
  {
    id: "execution.remote.artifacts",
    status: config.remoteArtifactPaths.length > 0 ? "pass" : "warn",
    summary: "Remote artifact policy",
    detail: `Policy=${config.remoteArtifactPolicy}; artifact paths=${config.remoteArtifactPaths.join(", ") || "none"}; snapshots persist metadata only.`,
  },
  {
    id: "mcp.bridge",
    status: config.mcpServerCommand ? "pass" : "warn",
    summary: "MCP bridge configuration",
    detail: config.mcpServerCommand
      ? `MCP bridge command configured: ${config.mcpServerCommand}`
      : "MCP_SERVER_COMMAND is not configured.",
  },
  {
    id: "acp.bridge",
    status: config.acpServerCommand ? "pass" : "warn",
    summary: "ACP bridge configuration",
    detail: config.acpServerCommand
      ? `ACP bridge command configured: ${config.acpServerCommand}`
      : "ACP_SERVER_COMMAND is not configured.",
  },
  {
    id: "execution.backends",
    status: "pass",
    summary: "Execution backend model",
    detail: `Execution layer supports ${config.executionBackend} as the active backend with timeout=${config.executionCommandTimeoutMs}ms and health timeout=${config.executionHealthTimeoutMs}ms.`,
  },
];
