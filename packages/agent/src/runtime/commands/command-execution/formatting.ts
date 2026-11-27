import { sanitizeTerminalText } from "../../../utils/terminal-text";
import { normalizeSlashCommandSyntax } from "../../command-catalog/index";
import type {
  ExecutionApprovalListRecord,
  ExecutionApprovalPromptInput,
  ShellCommandTurnResult,
} from "./types";

export function displayCommand(command: string): string {
  return normalizeSlashCommandSyntax(command);
}

// Match the CLI transcript's code/path token budget. Shell output is user
// data; the command formatter must not destroy it before presentation policy.
const SHELL_OUTPUT_TOKEN_LIMIT = 4_000;

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
    `STDOUT:\n${sanitizeTerminalText(result.stdout || "(empty)", {
      maxTokenLength: SHELL_OUTPUT_TOKEN_LIMIT,
    })}`,
    `STDERR:\n${sanitizeTerminalText(result.stderr || "(empty)", {
      maxTokenLength: SHELL_OUTPUT_TOKEN_LIMIT,
    })}`,
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
