import type { ChatEvent } from "../../shared/contracts";
import type { DisplayMessage } from "./models";

type UpdateAssistant = (
  sessionId: string,
  requestId: string,
  update: (message: DisplayMessage) => DisplayMessage,
) => void;

function terminalFailureText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  return typeof record.message === "string" ? record.message : "";
}

function terminalFailureNotice(data: unknown): string {
  const detail = terminalFailureText(data)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
  const summary = detail
    ? `Response interrupted: ${detail}`
    : "Response interrupted.";
  return `${summary} Retry to continue.`;
}

function failedResponseContent(content: string, data: unknown): string {
  const notice = terminalFailureNotice(data);
  if (!content.trim()) return notice;

  // A replayed terminal event must not turn a useful partial response into a
  // stack of identical failure notices.
  return content.endsWith(notice) ? content : `${content}\n\n${notice}`;
}

export function handleFailedChatTerminalEvent(
  event: ChatEvent,
  sessionId: string,
  updateAssistant: UpdateAssistant,
  finishRequest: (requestId: string) => void,
): boolean {
  if (event.event !== "response.failed" && event.event !== "error") {
    return false;
  }
  updateAssistant(sessionId, event.requestId, (message) => ({
    ...message,
    content: failedResponseContent(message.content, event.data),
    pending: false,
    error: true,
  }));
  finishRequest(event.requestId);
  return true;
}
