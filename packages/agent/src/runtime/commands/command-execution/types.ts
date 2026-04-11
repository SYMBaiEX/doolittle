import type { PlatformName } from "@/types/gateway";

export interface ShellCommandTurnResult {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs?: number;
}

export interface ExecutionApprovalPromptInput {
  id: string;
  command: string;
  reason: string;
}

export interface ExecutionApprovalListRecord {
  id: string;
  status: string;
  platform: string;
  userId: string;
  roomId: string;
  command: string;
  reason: string;
  createdAt: string;
  expiresAt: string;
}

export interface ExecutionApprovalScopeRecord {
  platform: PlatformName;
  userId: string;
  roomId: string;
}

export interface RemoteExecutionApprovalRule {
  pattern: RegExp;
  reason: string;
}
