import { beforeEach, expect, it, vi } from "vitest";
import type {
  BotConversationScope,
  SessionSummary,
  SessionsResponse,
} from "../../apps/desktop/src/shared/contracts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  apiResourceCacheKey: () => "fixture-bots",
  desktopQueryClient: {
    fetchQuery: ({ queryFn }: { queryFn(args: object): Promise<unknown> }) =>
      queryFn({}),
  },
  desktopRequest: request,
}));

import {
  loadBotSessionCatalog,
  loadOlderLeadHistory,
} from "../../apps/desktop/src/renderer/bots/session-catalog";

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function owner(botId: string, sessionId: string): BotConversationScope {
  return {
    botId,
    sessionId,
    projectId: "sample-project",
    workspacePath: "/workspace",
    createdAt: "2026-11-21T00:00:00Z",
    updatedAt: "2026-11-21T00:00:00Z",
  };
}

function summary(botId: string, sessionId: string): SessionSummary {
  return {
    botId,
    sessionId,
    title: "New history",
    participants: [],
    preview: [],
    messageCount: 3,
    workspacePath: "/untrusted-history-metadata",
  };
}

const catalog = {
  defaultBotId: "lead",
  bots: [
    { id: "lead", name: "Lead", isDefault: true, state: "ready" },
    { id: "active", name: "Active", isDefault: false, state: "busy" },
    { id: "stopped", name: "Stopped", isDefault: false, state: "stopped" },
  ],
};

beforeEach(() => {
  request.mockReset();
});

it("overlaps independent history reads and still applies authoritative ownership", async () => {
  const lead = pending<SessionsResponse>();
  const ledger = pending<{ conversations: BotConversationScope[] }>();
  const history = pending<SessionsResponse>();
  const namedHistoryStarted = pending<void>();
  const signal = new AbortController().signal;
  request.mockImplementation(
    async (
      path: string,
      _method: string,
      _body: unknown,
      _signal: AbortSignal,
      _timeout: number,
      botId: string,
    ) => {
      if (path === "/bots") return catalog;
      if (path === "/bots/active/conversations") return ledger.promise;
      if (path.startsWith("/sessions")) {
        if (botId !== "active") throw new Error("unexpected worker");
        namedHistoryStarted.resolve(undefined);
        return history.promise;
      }
      if (path === "/bots/lead/conversations")
        return { conversations: [owner("lead", "lead-chat")] };
      return { conversations: [owner("stopped", "stopped-chat")] };
    },
  );

  const result = loadBotSessionCatalog(lead.promise, [], { signal });
  await namedHistoryStarted.promise;
  // Both the catalog and the named worker were reached before the lead or
  // named ledger responded. Stopped bots still use only the saved ledger.
  expect(
    request.mock.calls.find(([path]) => path === "/sessions?limit=200"),
  ).toEqual([
    "/sessions?limit=200",
    "GET",
    undefined,
    signal,
    undefined,
    "active",
  ]);
  const active = summary("active", "active-chat");
  history.resolve({ sessions: [active] });
  ledger.resolve({ conversations: [owner("active", "active-chat")] });
  lead.resolve({ sessions: [summary("lead", "lead-chat")] });
  expect(await result).toEqual({
    sessions: [
      { ...summary("lead", "lead-chat"), ...boundContext },
      { ...active, ...boundContext },
      {
        ...boundContext,
        botId: "stopped",
        sessionId: "stopped-chat",
        startedAt: "2026-11-21T00:00:00Z",
        title: "Conversation",
        messageCount: 0,
        participants: [],
        preview: [],
      },
    ],
  });
});

const boundContext = {
  projectId: "sample-project",
  workspacePath: "/workspace",
  projectContext: undefined,
};

it("keeps the ledger and cached rows when a worker claims an unowned conversation", async () => {
  request.mockImplementation(async (path: string) => {
    if (path === "/bots") return catalog;
    if (path === "/bots/active/conversations")
      return { conversations: [owner("active", "active-chat")] };
    if (path.startsWith("/sessions"))
      return {
        sessions: [summary("active", "active-chat"), summary("lead", "other")],
      };
    return { conversations: [] };
  });
  const previous = {
    ...summary("active", "active-chat"),
    title: "Saved history",
  };
  expect(
    await loadBotSessionCatalog(Promise.resolve({ sessions: [] }), [previous]),
  ).toEqual({
    sessions: [{ ...previous, ...boundContext }],
    warnings: [
      "Active's history is unavailable; saved conversations are retained.",
    ],
  });
});

it("shows healthy bots and retains the failed bot's last saved inventory", async () => {
  request.mockImplementation(async (path: string) => {
    switch (path) {
      case "/bots":
        return catalog;
      case "/bots/lead/conversations":
        return { conversations: [owner("lead", "lead-chat")] };
      case "/bots/active/conversations":
        throw new Error("Owner ledger temporarily unavailable");
      case "/sessions?limit=200":
        return { sessions: [summary("active", "unverified-chat")] };
      case "/bots/stopped/conversations":
        return { conversations: [owner("stopped", "stopped-chat")] };
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  });
  const previous = [
    summary("lead", "lead-chat"),
    summary("active", "previous-active-chat"),
    summary("stopped", "removed-stopped-chat"),
  ];
  const result = await loadBotSessionCatalog(
    Promise.reject(new Error("Lead history is temporarily unavailable")),
    previous,
  );
  expect(
    result.sessions.map(({ botId, sessionId }) => [botId, sessionId]),
  ).toEqual([
    ["lead", "lead-chat"],
    ["stopped", "stopped-chat"],
    ["active", "previous-active-chat"],
  ]);
  expect(result).toMatchObject({
    sessions: [
      { title: previous[0]?.title, ...boundContext },
      { title: "Conversation", ...boundContext },
      previous[1],
    ],
    warnings: [
      "Lead history is unavailable; saved conversations are retained.",
      "Active's conversations could not be refreshed; saved conversations are retained.",
    ],
  });
});

it("omits conflicting conversation owners throughout paginated history", async () => {
  request.mockImplementation(async (path: string) => {
    switch (path) {
      case "/bots":
        return catalog;
      case "/bots/lead/conversations":
        return { conversations: [] };
      case "/bots/active/conversations":
        return {
          conversations: [
            owner("active", "active-chat"),
            owner("active", "duplicate-chat"),
          ],
        };
      case "/sessions?limit=200":
        return { sessions: [] };
      case "/sessions?limit=200&offset=1":
        return {
          sessions: [
            summary("lead", "duplicate-chat"),
            summary("lead", "older-chat"),
          ],
        };
      case "/bots/stopped/conversations":
        return { conversations: [owner("stopped", "duplicate-chat")] };
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  });
  const result = await loadBotSessionCatalog(
    { sessions: [summary("lead", "lead-chat")], hasMore: true },
    [],
  );
  expect(result.sessions.map(({ sessionId }) => sessionId)).toEqual([
    "lead-chat",
    "active-chat",
  ]);
  expect(result.warnings).toEqual([
    "Conversations with conflicting bot owners were omitted.",
  ]);
  const page = result.leadHistoryPage;
  expect(page).toBeDefined();
  if (!page) throw new Error("Expected additional lead history.");
  const publish = vi.fn();
  await loadOlderLeadHistory(page, new AbortController().signal, publish);
  expect(publish).toHaveBeenCalledExactlyOnceWith([
    summary("lead", "older-chat"),
  ]);
});

it("skips archived bots without warnings or retaining their dead rows", async () => {
  const withArchived = {
    defaultBotId: "lead",
    bots: [
      ...catalog.bots,
      {
        id: "archived",
        name: "Archived",
        isDefault: false,
        state: "archived",
        archivedAt: "2026-11-22T00:00:00Z",
      },
    ],
  };
  request.mockImplementation(async (path: string) => {
    switch (path) {
      case "/bots":
        return withArchived;
      case "/bots/archived/conversations":
        throw new Error("Archived bots must not be queried.");
      case "/bots/lead/conversations":
        return { conversations: [owner("lead", "lead-chat")] };
      case "/bots/active/conversations":
        return { conversations: [owner("active", "active-chat")] };
      case "/sessions?limit=200":
        return { sessions: [summary("active", "active-chat")] };
      case "/bots/stopped/conversations":
        return { conversations: [] };
      default:
        throw new Error(`Unexpected request: ${path}`);
    }
  });
  const previous = [
    summary("archived", "archived-chat"),
    summary("active", "active-chat"),
  ];
  const result = await loadBotSessionCatalog(
    Promise.resolve({ sessions: [summary("lead", "lead-chat")] }),
    previous,
  );
  expect(
    request.mock.calls.some(
      ([path]) => path === "/bots/archived/conversations",
    ),
  ).toBe(false);
  expect(result.warnings).toBeUndefined();
  expect(result.sessions.map(({ sessionId }) => sessionId)).toEqual([
    "lead-chat",
    "active-chat",
  ]);
});

it("does not fan out inventory calls after cancellation during a shared catalog request", async () => {
  const response = pending<typeof catalog>();
  request.mockReturnValue(response.promise);
  const controller = new AbortController();
  const result = loadBotSessionCatalog(Promise.resolve({ sessions: [] }), [], {
    signal: controller.signal,
  });
  controller.abort();
  response.resolve(catalog);
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
  expect(request).toHaveBeenCalledOnce();
});
