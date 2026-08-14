// @vitest-environment jsdom

import {
  act,
  createElement,
  type MutableRefObject,
  useEffect,
  useRef,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SessionMessagesResponse,
  SessionSummary,
} from "../../shared/contracts";
import type { StorageLike } from "../conversation-persistence";
import {
  loadStoredChatMessages,
  projectChatSessions,
  reconcileOrphanedPendingMessages,
  saveStoredChatMessages,
  useChatConversationState,
} from "./useChatConversationState";

const { desktopRequestMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
}));

vi.mock("../lib", () => ({
  desktopRequest: desktopRequestMock,
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

function memoryStorage(value: string | null): StorageLike {
  return {
    getItem: () => value,
    setItem: () => undefined,
  };
}

const remoteSession: SessionSummary = {
  endedAt: "2026-08-12T10:00:00.000Z",
  messageCount: 4,
  participants: ["user", "assistant"],
  preview: ["Remote preview"],
  sessionId: "remote",
  title: "Remote session",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function ConversationProbe({
  activeRequest = null,
  onValue,
  requestSession,
}: {
  activeRequest?: string | null;
  onValue: (value: ReturnType<typeof useChatConversationState>) => void;
  requestSession?: MutableRefObject<Record<string, string>>;
}) {
  const localRequestSession = useRef<Record<string, string>>({});
  const value = useChatConversationState({
    activeRequest,
    backendReady: true,
    onSelect: vi.fn(),
    remoteSessions: [remoteSession],
    requestSession: requestSession ?? localRequestSession,
    selectedId: remoteSession.sessionId,
  });
  useEffect(() => {
    onValue(value);
  }, [onValue, value]);
  return null;
}

describe("chat conversation state", () => {
  it("keeps transcript persistence best-effort when storage rejects writes", () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
    };
    expect(
      saveStoredChatMessages(
        storage,
        {
          remote: [
            {
              content: "Keep the in-memory transcript usable",
              createdAt: "2026-08-12T10:00:00.000Z",
              id: "message-1",
              role: "user",
            },
          ],
        },
        "remote",
      ),
    ).toBe(false);
  });

  it("restores only object entries that contain message arrays", () => {
    expect(
      loadStoredChatMessages(
        memoryStorage(
          JSON.stringify({
            valid: [
              {
                id: "message-1",
                role: "user",
                content: "valid",
                createdAt: "2026-08-12T10:00:00.000Z",
              },
              { id: "message-malformed", role: "user", content: null },
            ],
            invalid: { id: "message-2" },
          }),
        ),
      ),
    ).toEqual({
      valid: [
        {
          id: "message-1",
          role: "user",
          content: "valid",
          createdAt: "2026-08-12T10:00:00.000Z",
        },
      ],
      invalid: [],
    });
    expect(loadStoredChatMessages(memoryStorage("[]"))).toEqual({});
    expect(loadStoredChatMessages(memoryStorage("not json"))).toEqual({});
  });

  it("restores terminal and workbench context capsules from local history", () => {
    expect(
      loadStoredChatMessages(
        memoryStorage(
          JSON.stringify({
            terminal: [
              {
                id: "terminal-message",
                role: "user",
                content: "What failed?",
                createdAt: "2026-08-12T10:00:00.000Z",
                contextCapsule: {
                  kind: "terminal",
                  path: "Terminal",
                },
              },
            ],
            plan: [
              {
                id: "plan-message",
                role: "user",
                content: "Explain the plan.",
                createdAt: "2026-08-12T10:00:00.000Z",
                contextCapsule: {
                  kind: "plan",
                  path: "plan-summary",
                  source: "plan-summary",
                },
              },
            ],
          }),
        ),
      ),
    ).toMatchObject({
      terminal: [
        {
          contextCapsule: { kind: "terminal", path: "Terminal" },
        },
      ],
      plan: [
        {
          contextCapsule: {
            kind: "plan",
            path: "plan-summary",
            source: "plan-summary",
          },
        },
      ],
    });
  });

  it("merges local drafts with remote sessions and keeps pins first", () => {
    const sessions = projectChatSessions({
      messages: {
        local: [
          {
            content: "Inspect the workspace architecture",
            createdAt: "2026-08-12T09:00:00.000Z",
            id: "message-1",
            role: "user",
          },
        ],
      },
      pinnedSessions: { local: true },
      query: "",
      remoteSessions: [remoteSession],
    });

    expect(sessions.map((session) => session.sessionId)).toEqual([
      "local",
      "remote",
    ]);
    expect(sessions[0]).toMatchObject({
      messageCount: 1,
      pinned: true,
      preview: ["Inspect the workspace architecture"],
      title: "Inspect the workspace architecture",
    });
    expect(sessions[1]).toMatchObject({
      pinned: false,
      title: "Remote session",
    });
  });

  it("searches titles, identifiers, and first-message previews", () => {
    expect(
      projectChatSessions({
        messages: {},
        pinnedSessions: {},
        query: "remote preview",
        remoteSessions: [remoteSession],
      }).map((session) => session.sessionId),
    ).toEqual(["remote"]);
    expect(
      projectChatSessions({
        messages: {},
        pinnedSessions: {},
        query: "missing",
        remoteSessions: [remoteSession],
      }),
    ).toEqual([]);
  });
});

describe("chat history concurrency", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: vi.fn(),
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("does not let an in-flight history response erase a newly sent turn", async () => {
    const history = deferred<SessionMessagesResponse>();
    desktopRequestMock.mockReturnValue(history.promise);
    const requestSession = { current: {} as Record<string, string> };
    let latest: ReturnType<typeof useChatConversationState> | undefined;

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          onValue: (value) => (latest = value),
          requestSession,
        }),
      ),
    );
    expect(desktopRequestMock).toHaveBeenCalledWith(
      "/sessions/messages?sessionId=remote&limit=500",
      "GET",
      undefined,
      expect.any(AbortSignal),
    );

    act(() => {
      latest?.setMessages((current) => ({
        ...current,
        remote: [
          {
            id: "local-user",
            role: "user",
            content: "Send this now",
            createdAt: "2026-08-12T10:01:00.000Z",
          },
          {
            id: "assistant:request-1",
            role: "assistant",
            content: "",
            createdAt: "2026-08-12T10:01:00.000Z",
            pending: true,
          },
        ],
      }));
      requestSession.current["request-1"] = "remote";
      root.render(
        createElement(ConversationProbe, {
          activeRequest: "request-1",
          onValue: (value) => (latest = value),
          requestSession,
        }),
      );
    });

    await act(async () => {
      history.resolve({
        messages: [
          {
            id: "remote-old",
            role: "user",
            text: "Earlier prompt",
            createdAt: "2026-08-12T10:00:00.000Z",
          },
        ],
      });
      await Promise.resolve();
    });

    expect(latest?.selectedMessages).toEqual([
      {
        id: "local-user",
        role: "user",
        content: "Send this now",
        createdAt: "2026-08-12T10:01:00.000Z",
      },
      {
        id: "assistant:request-1",
        role: "assistant",
        content: "",
        createdAt: "2026-08-12T10:01:00.000Z",
        pending: true,
      },
    ]);
  });

  it("reconciles a persisted synthetic pending row when remote history has a real reply", async () => {
    const history = deferred<SessionMessagesResponse>();
    desktopRequestMock.mockReturnValue(history.promise);
    const stored = {
      remote: [
        {
          id: "persisted-user",
          role: "user",
          content: "Recover this turn",
          createdAt: "2026-08-12T10:01:00.000Z",
        },
        {
          id: "assistant:request-reloaded",
          role: "assistant",
          content: "",
          createdAt: "2026-08-12T10:01:00.000Z",
          pending: true,
        },
      ],
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) =>
          key === "doolittle.desktop.conversations.v2"
            ? JSON.stringify(stored)
            : null,
        setItem: vi.fn(),
      },
    });
    let latest: ReturnType<typeof useChatConversationState> | undefined;

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          onValue: (value) => (latest = value),
        }),
      ),
    );

    await act(async () => {
      history.resolve({
        messages: [
          {
            id: "remote-user",
            role: "user",
            text: "Recover this turn",
            createdAt: "2026-08-12T10:01:00.000Z",
          },
          {
            id: "remote-assistant",
            role: "assistant",
            text: "Recovered reply",
            createdAt: "2026-08-12T10:01:01.000Z",
          },
        ],
      });
      await Promise.resolve();
    });

    expect(latest?.selectedMessages.map((message) => message.id)).toEqual([
      "remote-user",
      "persisted-user",
      "remote-assistant",
    ]);
    expect(latest?.selectedMessages.at(-1)?.content).toBe("Recovered reply");
  });

  it("marks an orphaned pending row retryable when no remote assistant exists", () => {
    expect(
      reconcileOrphanedPendingMessages(
        [
          {
            id: "assistant:request-orphan",
            role: "assistant",
            content: "",
            createdAt: "2026-08-12T10:01:00.000Z",
            pending: true,
          },
        ],
        [],
        new Set(),
      ),
    ).toMatchObject([
      {
        content:
          "This response was interrupted before it finished. Retry it to continue.",
        error: true,
        pending: false,
      },
    ]);
  });
});
