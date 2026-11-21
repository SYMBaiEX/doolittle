import type { BotCatalogResponse, BotSummary } from "@doolittle/contracts/bots";
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
  lead: SessionsResponse | Promise<SessionsResponse>,
  previous: readonly SessionSummary[],
  {
    generation = 0,
    reuseFreshCatalog = false,
    signal,
  }: {
    generation?: number;
    reuseFreshCatalog?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<SessionsResponse & { warnings?: string[] }> {
  const catalogRequest = desktopQueryClient
    .fetchQuery({
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
    })
    .then(async (catalog) => {
      signal?.throwIfAborted();
      const inventories = await Promise.all(
        catalog.bots.map(async (bot) => {
          const [ledger, history] = await Promise.all([
            desktopRequest<{ conversations: BotConversationScope[] }>(
              `/bots/${encodeURIComponent(bot.id)}/conversations`,
              "GET",
              undefined,
              signal,
            ),
            loadReadyBotHistory(bot, signal),
          ]);
          return { bot, ledger, history };
        }),
      );
      return { catalog, inventories };
    });
  const [leadHistory, { catalog, inventories }] = await Promise.all([
    lead,
    catalogRequest,
  ]);
  signal?.throwIfAborted();
  const sessions = new Map<string, SessionSummary>(
    leadHistory.sessions.map((session) => [
      session.sessionId,
      { ...session, botId: session.botId ?? catalog.defaultBotId },
    ]),
  );
  const previousById = new Map(
    previous.map((session) => [session.sessionId, session]),
  );
  const warnings: string[] = [];
  for (const { bot, ledger, history } of inventories) {
    const byId = new Map<string, SessionSummary>();
    for (const owner of ledger.conversations) {
      if (owner.botId !== bot.id)
        throw new Error("Conversation ownership is inconsistent.");
      const previousSession = previousById.get(owner.sessionId);
      const cached =
        (bot.isDefault ? sessions.get(owner.sessionId) : undefined) ??
        (previousSession?.botId === owner.botId ? previousSession : undefined);
      byId.set(owner.sessionId, confirmedConversationSummary(owner, cached));
    }
    if (
      history?.every(
        (session) => session.botId === bot.id && byId.has(session.sessionId),
      )
    ) {
      for (const session of history) {
        const owner = byId.get(session.sessionId);
        byId.set(session.sessionId, {
          ...session,
          botId: owner?.botId,
          projectId: owner?.projectId,
          workspacePath: owner?.workspacePath,
          projectContext: owner?.projectContext,
        });
      }
    } else if (history !== undefined) {
      warnings.push(
        `${bot.name}'s history is unavailable; saved conversations are retained.`,
      );
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
  }
  return {
    sessions: [...sessions.values()],
    ...(warnings.length ? { warnings } : {}),
  };
}

async function loadReadyBotHistory(bot: BotSummary, signal?: AbortSignal) {
  if (bot.isDefault || !["ready", "busy", "waiting"].includes(bot.state))
    return;
  try {
    const { sessions } = await desktopRequest<SessionsResponse>(
      "/sessions?limit=200",
      "GET",
      undefined,
      signal,
      undefined,
      bot.id,
    );
    return Array.isArray(sessions) ? sessions : null;
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}
