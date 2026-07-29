import {
  type ActionResult,
  checkSenderRole,
  type Media,
  runShortcutGate,
  type State,
  type UUID,
} from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import { createProviderMessageMemory } from "../provider";
import type { ModelSettingsSnapshot } from "../provider/types";
import type { TurnState } from "../state";

export interface ProviderShortcutTurnResult {
  handledMessage: true;
  response: string;
  messageId: string;
  actionResults: ActionResult[];
}

async function resolveShortcutSenderRole(
  context: AgentExecutionContext,
  message: ReturnType<typeof createProviderMessageMemory>,
): Promise<"OWNER" | "ADMIN" | "USER" | "GUEST"> {
  if (String(message.entityId) === String(context.runtime.agentId)) {
    return "OWNER";
  }
  try {
    return (await checkSenderRole(context.runtime, message))?.role ?? "USER";
  } catch (error) {
    context.runtime.logger?.debug?.(
      { src: "doolittle-shortcut-gate", error },
      "Shortcut sender role lookup failed; defaulting to USER",
    );
    return "USER";
  }
}

export async function runProviderShortcutTurn(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  userId: string;
  effectiveMessage: string;
  settingsDuring: ModelSettingsSnapshot;
  attachments?: Media[];
}): Promise<ProviderShortcutTurnResult | undefined> {
  const message = createProviderMessageMemory(input);
  const messageId = String(message.id);
  const outcome = await runShortcutGate({
    runtime: input.context.runtime,
    message,
    state: {} as State,
    responseId: message.id as UUID,
    senderRole: await resolveShortcutSenderRole(input.context, message),
  });
  if (outcome?.kind !== "direct_reply") {
    return undefined;
  }

  const response = outcome.result.responseContent?.text?.trim();
  if (!response) {
    return undefined;
  }
  return {
    handledMessage: true,
    response,
    messageId,
    actionResults: input.context.runtime.getActionResults?.(messageId) ?? [],
  };
}
