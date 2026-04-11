import type { AppContext } from "@/runtime/bootstrap";
import type { CliExecutionResult, CliState } from "./types";

export function handleCliSessionCommand(
  normalizedTrimmed: string,
  context: Pick<AppContext, "services">,
  state: CliState,
): CliExecutionResult | undefined {
  if (normalizedTrimmed === "/resume") {
    const titled = context.services.sessions.listTitled(10);
    return {
      text: titled.length
        ? titled
            .map(
              (session) =>
                `- ${session.title ?? "(untitled)"}\n  session=${session.sessionId} messages=${session.messageCount} ended=${session.endedAt ?? "n/a"}`,
            )
            .join("\n")
        : "No titled sessions are available yet. Use /title <name> to name the current session.",
      tone: "info",
    };
  }
  if (normalizedTrimmed.startsWith("/resume ")) {
    const query = normalizedTrimmed.replace("/resume ", "").trim();
    const target = context.services.sessions.resolveByTitle(query);
    if (!target) {
      return {
        text: `Session not found for title: ${query}`,
        tone: "warning",
      };
    }
    state.activeSessionId = target.sessionId;
    return {
      text: `Resumed session ${target.title ?? target.sessionId}.`,
      tone: "success",
    };
  }
  if (normalizedTrimmed.startsWith("/title ")) {
    const title = normalizedTrimmed.replace("/title ", "").trim();
    if (!title) {
      return { text: "Usage: /title <name>", tone: "warning" };
    }
    const updated = context.services.sessions.rename(
      state.activeSessionId,
      title,
    );
    return {
      text: `Session titled: ${updated.title ?? title}`,
      tone: "success",
    };
  }
  return undefined;
}
