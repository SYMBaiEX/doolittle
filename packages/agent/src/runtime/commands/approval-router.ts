import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "../chat";
import {
  displayCommand,
  formatExecutionApprovalList,
  formatShellCommandResponse,
  isApprovalScopedToRequester,
  resolveRemoteExecutionPlatform,
  runShellCommandForTurn,
} from "./command-execution";

const APPROVAL_STATUSES = new Set([
  "pending",
  "approved",
  "denied",
  "used",
  "expired",
] as const);
type ApprovalStatus = "pending" | "approved" | "denied" | "used" | "expired";

export async function handleExecutionApprovalCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
  hooks?: AgentTurnHooks,
): Promise<string | undefined> {
  const sourcePlatform = resolveRemoteExecutionPlatform(input.source);

  if (trimmed === "/approvals" || trimmed === "/approvals list") {
    const approvals = context.services.executionApprovals
      .list()
      .filter((record) =>
        sourcePlatform ? isApprovalScopedToRequester(input, record) : true,
      )
      .slice(0, 20);
    return formatExecutionApprovalList(approvals);
  }

  if (trimmed.startsWith("/approvals list ")) {
    const rawStatus = trimmed.replace("/approvals list ", "").trim();
    const status = APPROVAL_STATUSES.has(rawStatus as ApprovalStatus)
      ? (rawStatus as ApprovalStatus)
      : undefined;
    const approvals = context.services.executionApprovals
      .list(status)
      .filter((record) =>
        sourcePlatform ? isApprovalScopedToRequester(input, record) : true,
      )
      .slice(0, 20);
    return formatExecutionApprovalList(approvals);
  }

  if (trimmed.startsWith("/approvals deny ")) {
    const id = trimmed.replace("/approvals deny ", "").trim();
    const record = context.services.executionApprovals.get(id);
    if (!record) {
      return `Execution approval not found: ${id}`;
    }
    if (!isApprovalScopedToRequester(input, record)) {
      return "You can only deny execution approvals for your own remote session.";
    }
    const denied = await context.services.executionApprovals.deny(id);
    return [
      `Denied approval ${denied.id}.`,
      `Command: ${denied.command}`,
      `Reason: ${denied.reason}`,
    ].join("\n");
  }

  if (trimmed.startsWith("/deny ")) {
    const id = trimmed.replace("/deny ", "").trim();
    if (!id) {
      return `Usage: ${displayCommand("/deny <approval-id>")}`;
    }
    return handleExecutionApprovalCommand(
      input,
      `/approvals deny ${id}`,
      context,
      hooks,
    );
  }

  if (trimmed.startsWith("/approvals approve ")) {
    const id = trimmed.replace("/approvals approve ", "").trim();
    const record = context.services.executionApprovals.get(id);
    if (!record) {
      return `Execution approval not found: ${id}`;
    }
    if (!isApprovalScopedToRequester(input, record)) {
      return "You can only approve execution requests for your own remote session.";
    }
    const approved = await context.services.executionApprovals.approve(id, {
      useImmediately: true,
    });
    const intro = `Approval ${approved.id} accepted. Executing: ${approved.command}`;
    await hooks?.onResponseProgress?.({
      chunk: intro,
      response: intro,
      phase: "command",
    });
    const result = await runShellCommandForTurn(
      approved.command,
      context,
      hooks,
    );
    return [intro, "", formatShellCommandResponse(result)].join("\n");
  }

  if (trimmed.startsWith("/approve ")) {
    const id = trimmed.replace("/approve ", "").trim();
    if (!id) {
      return `Usage: ${displayCommand("/approve <approval-id>")}`;
    }
    return handleExecutionApprovalCommand(
      input,
      `/approvals approve ${id}`,
      context,
      hooks,
    );
  }

  return undefined;
}
