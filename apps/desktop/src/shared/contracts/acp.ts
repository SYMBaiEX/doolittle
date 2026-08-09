/**
 * Read-only desktop view of Doolittle's configured ACP command bridge.
 * This is intentionally not an editor-protocol compatibility contract.
 */
export interface AcpBridgeStatus {
  enabled: boolean;
  detail: string;
  command?: string;
  timeoutMs: number;
  toolCount?: number;
  lastProbeAt?: string;
  lastError?: string;
}
export interface AcpBridgeEditorSummary {
  commandConfigured: boolean;
  registryPath?: string;
  installCommand?: string;
}
export interface AcpBridgeSessionSummary {
  totalSessions: number;
  recentSessionIds: string[];
  titledSessions: number;
  recentTitles: string[];
}
export interface AcpBridgeTool {
  name: string;
  description: string;
  kind: string;
  source: string;
}
export interface AcpStatusResponse {
  acp: AcpBridgeStatus;
}
export interface AcpEditorResponse {
  editor: AcpBridgeEditorSummary;
}
export interface AcpSessionsResponse {
  sessions: AcpBridgeSessionSummary;
}
export interface AcpToolsResponse {
  tools: AcpBridgeTool[];
}
export interface AcpProbeResponse {
  probe: { ok: boolean; detail: string };
}
