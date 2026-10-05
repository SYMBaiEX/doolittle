import type { BotCatalogResponse } from "@doolittle/contracts/bots";
import type { SessionSummary, SessionsResponse } from "../../shared/contracts";
import { desktopRequest } from "../lib";

type OwnedConversation = {
  botId: string;
  sessionId: string;
  projectId?: string;
  createdAt?: string;
};

/** Discover stopped workers through the authoritative ledger; never start one to list chats. */
export async function loadBotSessionCatalog(
  lead: SessionsResponse,
  previous: readonly SessionSummary[],
): Promise<SessionsResponse & { warnings?: string[] }> {
  const catalog = await desktopRequest<BotCatalogResponse>("/bots");
  const sessions = new Map<string, SessionSummary>(
    lead.sessions.map((session) => [
      session.sessionId,
      { ...session, botId: session.botId ?? catalog.defaultBotId },
    ]),
  );
  const warnings: string[] = [];
  await Promise.all(
    catalog.bots.map(async (bot) => {
      const ledger = await desktopRequest<{
        conversations: OwnedConversation[];
      }>(`/bots/${encodeURIComponent(bot.id)}/conversations`);
      const byId = new Map<string, SessionSummary>();
      for (const owner of ledger.conversations) {
        if (owner.botId !== bot.id)
          throw new Error("Conversation ownership is inconsistent.");
        const cached =
          (bot.isDefault ? sessions.get(owner.sessionId) : undefined) ??
          previous.find(
            (session) =>
              session.sessionId === owner.sessionId &&
              session.botId === owner.botId,
          );
        byId.set(
          owner.sessionId,
          cached ?? {
            botId: owner.botId,
            sessionId: owner.sessionId,
            ...(owner.projectId ? { projectId: owner.projectId } : {}),
            ...(owner.createdAt ? { startedAt: owner.createdAt } : {}),
            title: "Conversation",
            messageCount: 0,
            participants: [],
            preview: [],
          },
        );
      }
      if (!bot.isDefault && ["ready", "busy", "waiting"].includes(bot.state)) {
        try {
          const actual = await desktopRequest<SessionsResponse>(
            "/sessions?limit=200",
            "GET",
            undefined,
            undefined,
            undefined,
            bot.id,
          );
          for (const session of actual.sessions) {
            if (session.botId !== bot.id || !byId.has(session.sessionId))
              throw new Error("Conversation ownership is inconsistent.");
            byId.set(session.sessionId, session);
          }
        } catch {
          warnings.push(
            `${bot.name}'s history is unavailable; saved conversations are retained.`,
          );
        }
      }
      for (const [id, session] of byId) {
        if (bot.isDefault && sessions.get(id)?.botId === bot.id) continue;
        if (sessions.has(id))
          throw new Error("A conversation has conflicting bot owners.");
        sessions.set(id, session);
      }
    }),
  );
  return {
    sessions: [...sessions.values()],
    ...(warnings.length ? { warnings } : {}),
  };
}
