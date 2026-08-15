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
    content:
      terminalFailureText(event.data) || "The response could not be completed.",
    pending: false,
    error: true,
  }));
  finishRequest(event.requestId);
  return true;
}
