import type { SharedKnowledgeRecord } from "@doolittle/contracts/bots";
import type { DisplayMessage } from "../chat/models";
import { visibleAssistantText } from "../components/message-output";
import { desktopRequest } from "../eliza-client";

interface TranscriptBoundary {
  throughRunId?: string;
  throughMessageId?: string;
  terminalStatus?: string;
  messages?: Array<{ id: string; role: string; text: string }>;
}

/** Never guess a source from the most recent message or an ambient selection. */
export function promotionMessageId(
  message: DisplayMessage,
  boundary: TranscriptBoundary,
): string {
  if (
    !message.runId ||
    message.pending ||
    message.error ||
    boundary.throughRunId !== message.runId ||
    boundary.terminalStatus !== "complete" ||
    !Array.isArray(boundary.messages)
  )
    throw new Error("Only a completed, saved run can be promoted.");
  const text =
    message.role === "assistant"
      ? visibleAssistantText(message.content)
      : message.content;
  const selected = boundary.messages.find((row) => row.id === message.id);
  if (selected?.role === message.role && selected.text === text)
    return selected.id;
  // Streaming bubbles use a local ID. Only the immutable run-end anchor may
  // resolve it, and only if its saved content exactly matches the visible text.
  if (
    message.role === "assistant" &&
    message.id === `assistant:${message.runId}`
  ) {
    const anchored = boundary.messages.find(
      (row) => row.id === boundary.throughMessageId,
    );
    if (anchored?.role === "assistant" && anchored.text === text)
      return anchored.id;
  }
  throw new Error(
    "The selected message has not been saved with this run. Reload its history before promoting it.",
  );
}

export async function promoteProjectMessage(input: {
  sourceBotId: string;
  sessionId: string;
  projectId: string;
  message: DisplayMessage;
}): Promise<SharedKnowledgeRecord> {
  return promoteKnowledgeMessage({
    ...input,
    scope: { kind: "project", id: input.projectId },
  });
}

export async function promoteKnowledgeMessage(input: {
  sourceBotId: string;
  sessionId: string;
  scope: { kind: "project" | "team"; id: string };
  message: DisplayMessage;
}): Promise<SharedKnowledgeRecord> {
  const { sourceBotId, sessionId, scope, message } = input;
  if (!scope.id) throw new Error("Choose a project or team for this finding.");
  if (!message.runId) throw new Error("This message has no saved run.");
  const boundary = await desktopRequest<TranscriptBoundary>(
    `/sessions/messages?sessionId=${encodeURIComponent(sessionId)}&throughRunId=${encodeURIComponent(message.runId)}&limit=500`,
    "GET",
    undefined,
    undefined,
    undefined,
    sourceBotId,
  );
  const messageId = promotionMessageId(message, boundary);
  const text =
    message.role === "assistant"
      ? visibleAssistantText(message.content)
      : message.content;
  const response = await desktopRequest<{ knowledge: SharedKnowledgeRecord }>(
    "/bots/knowledge/promote",
    "POST",
    {
      sourceBotId,
      sessionId,
      ...(scope.kind === "team"
        ? { teamId: scope.id }
        : { projectId: scope.id }),
      runId: message.runId,
      messageId,
      title:
        text.trim().split("\n")[0]?.slice(0, 80) ||
        "Selected conversation finding",
      consent: true,
    },
  );
  return response.knowledge;
}
