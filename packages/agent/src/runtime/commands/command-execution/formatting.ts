import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import { sanitizeTerminalText } from "@/utils/terminal-text";
import type {
  ExecutionApprovalListRecord,
  ExecutionApprovalPromptInput,
  ShellCommandTurnResult,
} from "./types";

export function displayCommand(command: string): string {
  return normalizeSlashCommandSyntax(command);
}

export function formatShellCommandResponse(
  result: ShellCommandTurnResult,
): string {
  return [
    `Command: ${sanitizeTerminalText(result.command, {
      preserveNewlines: false,
      collapseWhitespace: true,
    })}`,
    result.exitCode !== undefined ? `Exit: ${result.exitCode}` : undefined,
    result.durationMs !== undefined
      ? `Duration: ${result.durationMs}ms`
      : undefined,
    `STDOUT:\n${sanitizeTerminalText(result.stdout || "(empty)")}`,
    `STDERR:\n${sanitizeTerminalText(result.stderr || "(empty)")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatExecutionApprovalPrompt(
  input: ExecutionApprovalPromptInput,
): string {
  return [
    "Remote execution approval required before I run that shell command.",
    `Approval: ${input.id}`,
    `Reason: ${input.reason}`,
    `Command: ${input.command}`,
    `Approve and run: ${displayCommand(`/approve ${input.id}`)}`,
    `Deny: ${displayCommand(`/deny ${input.id}`)}`,
    `Review pending: ${displayCommand("/approvals")}`,
  ].join("\n");
}

export function formatExecutionApprovalList(
  approvals: ExecutionApprovalListRecord[],
): string {
  if (!approvals.length) {
    return "No execution approvals recorded.";
  }
  return approvals
    .map(
      (record) =>
        `- ${record.id} [${record.status}] ${record.platform} user=${record.userId} room=${record.roomId}\n  reason=${record.reason}\n  command=${record.command}\n  created=${record.createdAt} expires=${record.expiresAt}`,
    )
    .join("\n\n");
}
