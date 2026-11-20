import type { ChatEvent } from "../../shared/contracts";

export function chatFailureDisposition(
  event: ChatEvent,
): "terminal" | "disconnected" | "submission" | undefined {
  if (event.event === "response.failed") return "terminal";
  if (event.event !== "error") return undefined;
  if (event.eventId !== undefined) return "terminal";
  return event.transportError ? "disconnected" : "submission";
}

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

export function failedResponseContent(content: string, data: unknown): string {
  const notice = terminalFailureNotice(data);
  if (!content.trim()) return notice;

  // A replayed terminal event must not turn a useful partial response into a
  // stack of identical failure notices.
  return content.endsWith(notice) ? content : `${content}\n\n${notice}`;
}
