import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";
import { resolvePendingExecutionApproval } from "./command-execution/approval";
import {
  runRuntimeShellCommand,
  runStreamingLocalShellCommand,
} from "./command-execution/execution";
import { formatExecutionApprovalPrompt } from "./command-execution/formatting";
import { resolveRemoteExecutionPlatform } from "./command-execution/platforms";
import { getExecutionApprovalReason } from "./command-execution/policy";
import type { ShellCommandTurnResult } from "./command-execution/types";

export { isApprovalScopedToRequester } from "./command-execution/approval";
export {
  displayCommand,
  formatExecutionApprovalList,
  formatExecutionApprovalPrompt,
  formatShellCommandResponse,
} from "./command-execution/formatting";
export { resolveRemoteExecutionPlatform } from "./command-execution/platforms";
export { getExecutionApprovalReason } from "./command-execution/policy";
export type { ShellCommandTurnResult } from "./command-execution/types";

export async function runShellCommandForTurn(
  command: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<ShellCommandTurnResult> {
  const backend = context.services.settings.get().execution.backend;
  if (backend === "local" && hooks?.onResponseProgress) {
    return runStreamingLocalShellCommand(command, context, hooks);
  }

  return runRuntimeShellCommand(command, context, hooks);
}

export async function maybeRequireRemoteExecutionApproval(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  command: string,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  const approval = await resolveRemoteExecutionApprovalPrompt(
    input,
    context,
    command,
  );
  if (!approval) return undefined;
  await hooks?.onResponseProgress?.({
    chunk: approval.prompt,
    response: approval.prompt,
    phase: "command",
  });
  return approval.prompt;
}

export interface RemoteExecutionApprovalPrompt {
  id: string;
  prompt: string;
  created: boolean;
}

export async function resolveRemoteExecutionApprovalPrompt(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  command: string,
): Promise<RemoteExecutionApprovalPrompt | undefined> {
  const platform = resolveRemoteExecutionPlatform(input.source);
  const reason = getExecutionApprovalReason(command);
  if (!platform || !reason) {
    return undefined;
  }

  const pending = await resolvePendingExecutionApproval({
    input,
    context,
    command,
    platform,
    reason,
  });
  if (!pending) {
    return undefined;
  }
  const prompt = formatExecutionApprovalPrompt({
    id: pending.id,
    command,
    reason: pending.reason,
  });
  return { id: pending.id, prompt, created: pending.created };
}
