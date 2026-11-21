import type { BotCatalogResponse } from "@doolittle/contracts/bots";
import type {
  BackendPhase,
  BotConversationScope,
  SessionSummary,
  SessionsResponse,
} from "../../shared/contracts";
import {
  apiResourceCacheKey,
  desktopQueryClient,
  desktopRequest,
  useApiResource,
} from "../lib";
import { confirmedConversationSummary } from "../session-conversation-scope";

const BOT_CATALOG_PATH = "/bots";

export function useDesktopBotCatalog(phase: BackendPhase, generation: number) {
  return useApiResource<BotCatalogResponse>(BOT_CATALOG_PATH, [
    phase,
    generation,
  ]);
}

/** Discover stopped workers through the authoritative ledger; never start one to list chats. */
export async function loadBotSessionCatalog(
  lead: SessionsResponse,
  previous: readonly SessionSummary[],
  { generation = 0, reuseFreshCatalog = false } = {},
): Promise<SessionsResponse & { warnings?: string[] }> {
  const catalog = await desktopQueryClient.fetchQuery({
    queryKey: [apiResourceCacheKey(BOT_CATALOG_PATH, ["ready", generation])],
    queryFn: ({ signal }) =>
      desktopRequest<BotCatalogResponse>(
        BOT_CATALOG_PATH,
        "GET",
        undefined,
        signal,
      ),
    // Startup can reuse the shell's catalog. A refresh can follow a durable
    // chat write, so it still needs a current roster of conversation owners.
    ...(reuseFreshCatalog ? {} : { staleTime: 0 }),
  });
  const sessions = new Map<string, SessionSummary>(
    lead.sessions.map((session) => [
      session.sessionId,
      { ...session, botId: session.botId ?? catalog.defaultBotId },
    ]),
  );
  const previousById = new Map(
    previous.map((session) => [session.sessionId, session]),
  );
  const warnings: string[] = [];
  await Promise.all(
    catalog.bots.map(async (bot) => {
      const ledger = await desktopRequest<{
        conversations: BotConversationScope[];
      }>(`/bots/${encodeURIComponent(bot.id)}/conversations`);
      const byId = new Map<string, SessionSummary>();
      for (const owner of ledger.conversations) {
        if (owner.botId !== bot.id)
          throw new Error("Conversation ownership is inconsistent.");
        const previousSession = previousById.get(owner.sessionId);
        const cached =
          (bot.isDefault ? sessions.get(owner.sessionId) : undefined) ??
          (previousSession?.botId === owner.botId
            ? previousSession
            : undefined);
        byId.set(owner.sessionId, confirmedConversationSummary(owner, cached));
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
            const owner = byId.get(session.sessionId);
            byId.set(session.sessionId, {
              ...session,
              botId: owner?.botId,
              projectId: owner?.projectId,
              workspacePath: owner?.workspacePath,
              projectContext: owner?.projectContext,
            });
          }
        } catch {
          warnings.push(
            `${bot.name}'s history is unavailable; saved conversations are retained.`,
          );
        }
      }
      for (const [id, session] of byId) {
        if (bot.isDefault && sessions.get(id)?.botId === bot.id) {
          sessions.set(id, session);
          continue;
        }
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
