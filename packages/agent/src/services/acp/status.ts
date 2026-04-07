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
  registryPath: string;
  exportDir: string;
  importDir: string;
  toolCount: number;
  lastPublishAt?: string;
  lastExportAt?: string;
  lastImportAt?: string;
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
}

export function createAcpServiceStatus(
  input: AcpServiceStatusInput,
): AcpServiceStatus {
  return {
    ...createCommandBridgeStatus({
      command: input.command,
      timeoutMs: input.timeoutMs,
      detail: input.command
        ? `ACP bridge command is configured for Doolittle editor and protocol integrations. Tools: ${input.toolCount}.`
        : "ACP bridge surface is available locally, but ACP_SERVER_COMMAND is not configured yet.",
      lastProbeAt: input.lastProbeAt,
      lastInvocationAt: input.lastInvocationAt,
      lastError: input.lastError,
    }),
    registryPath: input.registryPath,
    exportDir: input.exportDir,
    importDir: input.importDir,
    toolCount: input.toolCount,
    lastPublishAt: input.lastPublishAt,
    lastExportAt: input.lastExportAt,
    lastImportAt: input.lastImportAt,
  };
}

export type {
  AcpEditorSummary,
  AcpPackageMetadata,
  AcpRegistryEntry,
  AcpSessionSummary,
};
