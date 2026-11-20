import type { BotCatalogResponse, BotSummary } from "@doolittle/contracts/bots";
import type { SessionSummary } from "../../shared/contracts";
import type { ConversationDrafts } from "../conversation-persistence";
import { sessionProjectTarget } from "./session-bindings";

/** A session's persisted owner wins over whichever contact is selected now. */
export function sessionBotId(
  sessionId: string,
  sessions: readonly SessionSummary[],
  localBindings: Readonly<Record<string, string>>,
  defaultBotId: string,
): string {
  const saved = sessions.find((session) => session.sessionId === sessionId);
  return saved
    ? (saved.botId ?? defaultBotId)
    : Object.hasOwn(localBindings, sessionId)
      ? (localBindings[sessionId] ?? "")
      : "";
}

export function visibleBots(catalog: BotCatalogResponse | null): BotSummary[] {
  if (!catalog) return [];
  return catalog.bots
    .filter((bot) => !bot.archivedAt)
    .sort((left, right) =>
      left.id === catalog.defaultBotId
        ? -1
        : right.id === catalog.defaultBotId
          ? 1
          : left.name.localeCompare(right.name),
    );
}

export function latestBotSession(
  sessions: readonly SessionSummary[],
  botId: string,
  defaultBotId: string,
): SessionSummary | undefined {
  return [...sessions]
    .filter((session) => (session.botId ?? defaultBotId) === botId)
    .sort((left, right) =>
      (right.endedAt ?? right.startedAt ?? "").localeCompare(
        left.endedAt ?? left.startedAt ?? "",
      ),
    )[0];
}

/** Resume the first private draft before the contact acquires sent history. */
export function firstPrivateBotDraft({
  botId,
  defaultBotId,
  drafts,
  sessions,
  botBindings,
  projectBindings,
}: {
  botId: string;
  defaultBotId: string;
  drafts: ConversationDrafts;
  sessions: readonly SessionSummary[];
  botBindings: Readonly<Record<string, string>>;
  projectBindings: Readonly<Record<string, string | null>>;
}): string | undefined {
  if (
    sessions.some(
      (session) =>
        (session.botId ?? defaultBotId) === botId && session.messageCount > 0,
    )
  )
    return undefined;
  return Object.keys(drafts)
    .reverse()
    .find((id) => {
      const target = sessionProjectTarget(id, sessions, projectBindings);
      return (
        target !== undefined &&
        !target.projectId &&
        sessionBotId(id, sessions, botBindings, defaultBotId) === botId
      );
    });
}
