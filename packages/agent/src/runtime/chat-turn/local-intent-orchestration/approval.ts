import type { AgentExecutionContext, AgentTurnHooks } from "@/runtime/chat";
import { maybeRequireRemoteExecutionApproval } from "@/runtime/commands/command-execution";
import type { ChatTurnRequest } from "@/types/runtime";
import { storeSessionMessage } from "../state";
import type { DirectLocalIntentApprovalDependencies } from "./types";

export async function executeApprovedDirectLocalIntent(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  options: AgentTurnHooks | undefined,
  turn: Pick<import("../state").TurnState, "sessionId" | "roomId" | "entityId">,
  intent: {
    label?: string;
  },
  pendingNotice?: string,
  dependencies: DirectLocalIntentApprovalDependencies = {},
): Promise<string | undefined> {
  const requireRemoteExecutionApproval =
    dependencies.maybeRequireRemoteExecutionApproval ??
    maybeRequireRemoteExecutionApproval;
  const persistSessionMessage =
    dependencies.storeSessionMessage ?? storeSessionMessage;

  const label = intent.label ?? "";
  if (label.startsWith("shell:")) {
    const command = label.slice("shell:".length).trim();
    const approvalPrompt = await requireRemoteExecutionApproval(
      input,
      context,
      command,
      options,
    );
    if (approvalPrompt) {
      context.services.runController.setPendingApprovals(turn.sessionId, 1);
      persistSessionMessage(context, {
        sessionId: turn.sessionId,
        roomId: turn.roomId,
        entityId: turn.entityId,
        role: "assistant",
        text: approvalPrompt,
      });
      context.services.runController.finishTurn(turn.sessionId, "complete");
      return approvalPrompt;
    }
  }

  if (pendingNotice) {
    await options?.onNotice?.({
      kind: "status",
      message: pendingNotice,
    });
  }

  return undefined;
}
