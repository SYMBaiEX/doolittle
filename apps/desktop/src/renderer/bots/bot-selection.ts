import type { BotCatalogResponse, BotSummary } from "@doolittle/contracts/bots";
import type { SessionSummary } from "../../shared/contracts";

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
