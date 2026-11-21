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
const SESSION_PAGE_SIZE = 200;

interface LeadHistoryPage {
  botId: string;
  offset: number;
  omittedSessionIds: ReadonlySet<string>;
}

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
): Promise<{
  sessions: SessionSummary[];
  warnings?: string[];
  leadHistoryPage?: LeadHistoryPage;
}> {
  const leadRequest = safelyLoadInventory(() => Promise.resolve(lead), signal);
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
            safelyLoadInventory(async () => {
              const { conversations } = await desktopRequest<{
                conversations: BotConversationScope[];
              }>(
                `/bots/${encodeURIComponent(bot.id)}/conversations`,
                "GET",
                undefined,
                signal,
              );
              if (
                !Array.isArray(conversations) ||
                conversations.some((owner) => !owner || owner.botId !== bot.id)
              )
                throw new Error("Conversation ownership is inconsistent.");
              return conversations;
            }, signal),
            loadReadyBotHistory(bot, signal),
          ]);
          return { bot, ledger, history };
        }),
      );
      return { catalog, inventories };
    });
  const [leadHistory, { catalog, inventories }] = await Promise.all([
    leadRequest,
    catalogRequest,
  ]);
  signal?.throwIfAborted();
  const sessions = new Map<string, SessionSummary>();
  const previousById = new Map(
    previous.map((session) => [session.sessionId, session]),
  );
  const warnings: string[] = [];
  const conflicts = new Set<string>();
  const unavailableLedgers = new Set<string>();
  const addSession = (session: SessionSummary) => {
    const id = session.sessionId;
    if (conflicts.has(id)) return;
    const existing = sessions.get(id);
    if (existing && existing.botId !== session.botId) {
      sessions.delete(id);
      conflicts.add(id);
    } else {
      sessions.set(id, session);
    }
  };
  const leadSessions = verifiedLeadHistory(leadHistory, catalog.defaultBotId);
  if (leadSessions) {
    for (const session of leadSessions) addSession(session);
  } else {
    warnings.push(
      "Lead history is unavailable; saved conversations are retained.",
    );
  }
  for (const { bot, ledger, history } of inventories) {
    if (!ledger) {
      unavailableLedgers.add(bot.id);
      warnings.push(
        `${bot.name}'s conversations could not be refreshed; saved conversations are retained.`,
      );
      continue;
    }
    const byId = new Map<string, SessionSummary>();
    for (const owner of ledger) {
      const loadedSession = sessions.get(owner.sessionId);
      const previousSession = previousById.get(owner.sessionId);
      const cached =
        (bot.isDefault && loadedSession?.botId === owner.botId
          ? loadedSession
          : undefined) ??
        (previousSession?.botId === owner.botId ? previousSession : undefined);
      byId.set(owner.sessionId, confirmedConversationSummary(owner, cached));
    }
    if (
      history?.every(
        (session) =>
          session && session.botId === bot.id && byId.has(session.sessionId),
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
    for (const session of byId.values()) addSession(session);
  }
  // A cached row may fill a failed owner read. It cannot override another
  // bot's fresh ledger or revive an ID with conflicting ownership.
  for (const session of previousById.values()) {
    const botId = session.botId ?? catalog.defaultBotId;
    if (unavailableLedgers.has(botId) && !sessions.has(session.sessionId))
      addSession({ ...session, botId });
  }
  if (conflicts.size > 0)
    warnings.push("Conversations with conflicting bot owners were omitted.");
  return {
    sessions: [...sessions.values()],
    ...(warnings.length ? { warnings } : {}),
    ...(leadHistory?.hasMore && leadSessions?.length
      ? {
          leadHistoryPage: {
            botId: catalog.defaultBotId,
            offset: leadSessions.length,
            omittedSessionIds: conflicts,
          },
        }
      : {}),
  };
}

export function loadLeadSessionPage(signal: AbortSignal, offset = 0) {
  const page = offset > 0 ? `&offset=${offset}` : "";
  return desktopRequest<SessionsResponse>(
    `/sessions?limit=${SESSION_PAGE_SIZE}${page}`,
    "GET",
    undefined,
    signal,
  );
}

export async function loadOlderLeadHistory(
  { botId, offset, omittedSessionIds }: LeadHistoryPage,
  signal: AbortSignal,
  publish: (sessions: SessionSummary[]) => void,
) {
  for (let nextOffset = offset; ; ) {
    signal.throwIfAborted();
    const page = await loadLeadSessionPage(signal, nextOffset);
    signal.throwIfAborted();
    const sessions = verifiedLeadHistory(page, botId);
    if (!sessions || (page.hasMore && sessions.length === 0))
      throw new Error("Older conversation history could not be loaded.");
    publish(sessions.filter((row) => !omittedSessionIds.has(row.sessionId)));
    if (!page.hasMore) return;
    nextOffset += sessions.length;
  }
}

export function mergeOlderLeadHistory(
  current: SessionSummary[],
  older: readonly SessionSummary[],
): SessionSummary[] {
  const byId = new Map(current.map((row) => [row.sessionId, row]));
  let changed = false;
  for (const row of older) {
    const existing = byId.get(row.sessionId);
    if (!existing) {
      byId.set(row.sessionId, row);
      changed = true;
    } else if (existing.botId === row.botId) {
      // Fill ledger placeholders and discover group channels without replacing
      // a more recent preview or changing a host-confirmed workspace.
      if (existing.messageCount === 0 && row.messageCount > 0) {
        byId.set(row.sessionId, {
          ...row,
          conversationKind: existing.conversationKind ?? row.conversationKind,
          projectId: existing.projectId,
          workspacePath: existing.workspacePath,
          projectContext: existing.projectContext,
          readOnly: existing.readOnly,
        });
        changed = true;
      } else if (!existing.conversationKind && row.conversationKind) {
        byId.set(row.sessionId, {
          ...existing,
          conversationKind: row.conversationKind,
        });
        changed = true;
      }
    }
  }
  return changed ? [...byId.values()] : current;
}

function verifiedLeadHistory(
  page: SessionsResponse | null,
  botId: string,
): SessionSummary[] | null {
  if (
    !Array.isArray(page?.sessions) ||
    page.sessions.some(
      (row) =>
        !row ||
        typeof row.sessionId !== "string" ||
        (row.botId !== undefined && row.botId !== botId),
    )
  )
    return null;
  return page.sessions.map((row) => ({ ...row, botId }));
}

async function safelyLoadInventory<T>(
  load: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    return await load();
  } catch {
    signal?.throwIfAborted();
    return null;
  }
}

async function loadReadyBotHistory(bot: BotSummary, signal?: AbortSignal) {
  if (bot.isDefault || !["ready", "busy", "waiting"].includes(bot.state))
    return;
  return safelyLoadInventory(async () => {
    const { sessions } = await desktopRequest<SessionsResponse>(
      `/sessions?limit=${SESSION_PAGE_SIZE}`,
      "GET",
      undefined,
      signal,
      undefined,
      bot.id,
    );
    return Array.isArray(sessions) ? sessions : null;
  }, signal);
}
