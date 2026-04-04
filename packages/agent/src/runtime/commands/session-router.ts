import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";

export async function handleSessionCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  sessionKey: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed.startsWith("/search ")) {
    const query = trimmed.replace("/search ", "").trim();
    const matches = context.services.sessions.search(
      query,
      context.config.sessionSearchLimit,
    );
    return matches.length
      ? matches
          .map(
            (match) =>
              `- [${match.createdAt}] (${match.role}) session=${match.sessionId}: ${match.text}`,
          )
          .join("\n")
      : "No prior session matches found.";
  }

  if (trimmed === "/sessions" || trimmed === "/sessions list") {
    const sessions = context.services.sessions.listSessions(10);
    return sessions.length
      ? sessions
          .map(
            (session) =>
              `- ${session.sessionId} messages=${session.messageCount} started=${session.startedAt ?? "n/a"} ended=${session.endedAt ?? "n/a"} participants=${session.participants.join(",") || "none"}`,
          )
          .join("\n")
      : "No sessions recorded.";
  }

  if (trimmed === "/resume") {
    const titled = context.services.sessions.listTitled(10);
    return titled.length
      ? titled
          .map(
            (session) =>
              `- ${session.title ?? "(untitled)"}\n  session=${session.sessionId} messages=${session.messageCount} ended=${session.endedAt ?? "n/a"}`,
          )
          .join("\n")
      : "No titled sessions are available yet. Use /title <name> to name the current session.";
  }

  if (trimmed.startsWith("/resume ")) {
    const query = trimmed.replace("/resume ", "").trim();
    if (!query) {
      return "Usage: /resume <session title>";
    }
    const target = context.services.sessions.resolveByTitle(query);
    if (!target) {
      return `Session not found for title: ${query}`;
    }
    const currentRoute = context.services.gatewaySessions.get(sessionKey);
    if (currentRoute) {
      context.services.gatewaySessions.setActiveAgentSession(
        sessionKey,
        target.sessionId,
      );
      return `Resumed session ${target.title ?? target.sessionId}. New messages on this route will continue in ${target.sessionId}.`;
    }
    return JSON.stringify(target, null, 2);
  }

  if (trimmed.startsWith("/title ")) {
    const title = trimmed.replace("/title ", "").trim();
    if (!title) {
      return "Usage: /title <name>";
    }
    return JSON.stringify(
      context.services.sessions.rename(sessionKey, title),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session title ")) {
    const payload = trimmed.replace("/session title ", "").trim();
    const [sessionId, title] = payload.split("::").map((part) => part.trim());
    if (!sessionId || !title) {
      return "Usage: /session title <session-id> :: <title>";
    }
    return JSON.stringify(
      context.services.sessions.rename(sessionId, title),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session continuity ")) {
    const sessionId = trimmed.replace("/session continuity ", "").trim();
    if (!sessionId) {
      return "Usage: /session continuity <session-id>";
    }
    return JSON.stringify(
      context.services.sessions.continuity(sessionId),
      null,
      2,
    );
  }

  if (trimmed === "/session summary") {
    return JSON.stringify(
      context.services.sessions.summarize(sessionKey),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session summary ")) {
    const sessionId = trimmed.replace("/session summary ", "").trim();
    if (!sessionId) {
      return "Usage: /session summary <session-id>";
    }
    return JSON.stringify(
      context.services.sessions.summarize(sessionId),
      null,
      2,
    );
  }

  if (trimmed === "/usage") {
    return JSON.stringify(context.services.sessions.usage(sessionKey), null, 2);
  }

  if (trimmed.startsWith("/usage ")) {
    const target = trimmed.replace("/usage ", "").trim();
    if (!target) {
      return "Usage: /usage <session-id|session-title>";
    }
    const resolved =
      context.services.sessions.resolveByTitle(target)?.sessionId ?? target;
    return JSON.stringify(context.services.sessions.usage(resolved), null, 2);
  }

  return undefined;
}
