import { PROTOCOL_VERSION } from "@doolittle/acp";
import type {
  AcpEditorSummary,
  AcpPackageMetadata,
  AcpRegistryEntry,
  AcpSessionSummary,
} from "@/types";
import {
  type CommandBridgeStatusBase,
  createCommandBridgeStatus,
} from "../bridge-status";

export interface AcpServiceStatus extends CommandBridgeStatusBase {
  protocolVersion: number;
  sdkVersion: "1.3.0";
  externalCommandConfigured: boolean;
  registryPath: string;
  exportDir: string;
  importDir: string;
  toolCount: number;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
  protocolEvents: number;
  protocolEventCounts: Record<string, number>;
  lastProtocolEvent?: {
    event: string;
    at: string;
    detail?: Record<string, unknown>;
  };
}

export interface AcpServiceStatusInput {
  command?: string;
  timeoutMs: number;
  registryPath: string;
  exportDir: string;
  importDir: string;
  toolCount: number;
  lastProbeAt?: string;
  lastInvocationAt?: string;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
  lastError?: string;
  protocolEvents?: number;
  protocolEventCounts?: Record<string, number>;
  lastProtocolEvent?: {
    event: string;
    at: string;
    detail?: Record<string, unknown>;
  };
}

export function createAcpServiceStatus(
  input: AcpServiceStatusInput,
): AcpServiceStatus {
  return {
    ...createCommandBridgeStatus({
      command: input.command,
      timeoutMs: input.timeoutMs,
      detail: input.command
        ? `Official ACP v${PROTOCOL_VERSION} runtime is ready; an external ACP command is also configured. Tools: ${input.toolCount}.`
        : `Official ACP v${PROTOCOL_VERSION} runtime is ready in-process and through packages/agent/src/acp-server.ts. Tools: ${input.toolCount}.`,
      lastProbeAt: input.lastProbeAt,
      lastInvocationAt: input.lastInvocationAt,
      lastError: input.lastError,
    }),
    enabled: true,
    protocolVersion: PROTOCOL_VERSION,
    sdkVersion: "1.3.0",
    externalCommandConfigured: Boolean(input.command),
    registryPath: input.registryPath,
    exportDir: input.exportDir,
    importDir: input.importDir,
    toolCount: input.toolCount,
    lastPublishAt: input.lastPublishAt,
    lastExportAt: input.lastExportAt,
    lastImportAt: input.lastImportAt,
    protocolEvents: input.protocolEvents ?? 0,
    protocolEventCounts: input.protocolEventCounts ?? {},
    lastProtocolEvent: input.lastProtocolEvent,
  };
}

export type {
  AcpEditorSummary,
  AcpPackageMetadata,
  AcpRegistryEntry,
  AcpSessionSummary,
};
