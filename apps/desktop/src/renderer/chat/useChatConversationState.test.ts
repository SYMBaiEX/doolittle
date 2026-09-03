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
import { composeChatContextMessage } from "../chat-context-handoff";
import type { StorageLike } from "../conversation-persistence";
import { snapshotDraftForDispatch } from "./draft-dispatch-recovery";
import {
  loadStoredChatMessages,
  mergeConversationHistory,
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
  backendReady = true,
  onValue,
  requestSession,
  remoteSessions = [remoteSession],
  selectedId = remoteSession.sessionId,
}: {
  activeRequest?: string | null;
  backendReady?: boolean;
  onValue: (value: ReturnType<typeof useChatConversationState>) => void;
  requestSession?: MutableRefObject<Record<string, string>>;
  remoteSessions?: readonly SessionSummary[];
  selectedId?: string;
}) {
  const localRequestSession = useRef<Record<string, string>>({});
  const value = useChatConversationState({
    activeRequest,
    backendReady,
    onSelect: vi.fn(),
    remoteSessions,
    requestSession: requestSession ?? localRequestSession,
    selectedId,
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

  it("keeps the selected session and unfiltered count stable while filtering history", () => {
    let latest: ReturnType<typeof useChatConversationState> | undefined;
    act(() =>
      root.render(
        createElement(ConversationProbe, {
          backendReady: false,
          onValue: (value) => (latest = value),
        }),
      ),
    );

    const initialSession = latest?.selectedSession;
    act(() => latest?.setSessionSearch("missing"));

    expect(latest?.sessions).toEqual([]);
    expect(latest?.sessionsCount).toBe(1);
    expect(latest?.selectedSession).toEqual(initialSession);
  });

  it("restores an unsent capsule alongside the visible draft after reload", () => {
    const attachment = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "notes.txt",
      kind: "document" as const,
      mimeType: "text/plain",
      sizeBytes: 42,
      sha256: "a".repeat(64),
    };
    const savedDrafts = {
      remote: {
        text: "Explain the failure",
        attachments: [attachment],
        capsule: {
          kind: "terminal",
          path: "Terminal",
          content: "<terminal_context>exit 1</terminal_context>",
        },
      },
    };
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) =>
          key === "doolittle.desktop.conversation.drafts.v1"
            ? JSON.stringify(savedDrafts)
            : null,
        setItem: vi.fn(),
      },
    });
    let latest: ReturnType<typeof useChatConversationState> | undefined;

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          backendReady: false,
          onValue: (value) => (latest = value),
        }),
      ),
    );

    expect(latest?.draft).toBe("Explain the failure");
    expect(latest?.chatContextCapsule).toEqual(savedDrafts.remote.capsule);
    expect(latest?.draftAttachments).toEqual([attachment]);
    expect(
      composeChatContextMessage(
        latest?.draft ?? "",
        latest?.chatContextCapsule ?? null,
      ),
    ).toBe(
      "Explain the failure\n\n<terminal_context>exit 1</terminal_context>",
    );

    act(() => latest?.setChatContextCapsule(null));
    expect(latest?.chatContextCapsule).toBeNull();
    expect(latest?.draft).toBe("Explain the failure");
  });

  it("reports draft cache failures without hiding transcript cache failures", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota exceeded", "QuotaExceededError");
        },
      },
    });
    let latest: ReturnType<typeof useChatConversationState> | undefined;

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          backendReady: false,
          onValue: (value) => (latest = value),
        }),
      ),
    );

    expect(latest?.storageWarning).toContain("Local transcript cache");
    expect(latest?.storageWarning).toContain("Local draft cache");
  });

  it("keeps draft attachments isolated by chat and clears only the current draft", () => {
    let latest: ReturnType<typeof useChatConversationState> | undefined;
    const setItem = vi.fn();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem },
    });
    const attachment = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "notes.txt",
      kind: "document" as const,
      mimeType: "text/plain",
      sizeBytes: 42,
      sha256: "a".repeat(64),
    };
    const render = (selectedId: string) =>
      root.render(
        createElement(ConversationProbe, {
          backendReady: false,
          onValue: (value) => (latest = value),
          selectedId,
        }),
      );

    act(() => render("remote"));
    act(() => {
      latest?.setDraft("First chat");
      latest?.setDraftAttachments([attachment], {
        [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
      });
    });
    expect(latest?.draftAttachments).toEqual([attachment]);
    expect(latest?.draftAttachmentCleanup).toEqual({
      [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
    });

    act(() => render("second"));
    expect(latest?.draftAttachments).toEqual([]);
    act(() => {
      latest?.setDraft("Second chat");
      latest?.setDraftAttachments([attachment], {
        [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
      });
    });

    act(() => render("remote"));
    expect(latest?.draft).toBe("First chat");
    expect(latest?.draftAttachments).toEqual([attachment]);
    expect(latest?.draftAttachmentCleanup).toEqual({
      [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
    });
    act(() => {
      latest?.setDraft("");
      latest?.setDraftAttachments([], {});
    });

    act(() => render("second"));
    expect(latest?.draft).toBe("Second chat");
    expect(latest?.draftAttachments).toEqual([attachment]);
    expect(latest?.draftAttachmentCleanup).toEqual({
      [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
    });
    act(() =>
      latest?.setDraftForSession("forked", "Edited branch", [attachment], {
        [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
      }),
    );
    act(() => render("forked"));
    expect(latest?.draft).toBe("Edited branch");
    expect(latest?.draftAttachments).toEqual([attachment]);
    expect(latest?.draftAttachmentCleanup).toEqual({
      [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
    });
    expect(setItem).toHaveBeenCalledWith(
      "doolittle.desktop.conversation.drafts.v1",
      expect.not.stringContaining("First chat"),
    );
  });

  it("restores a rejected dispatch's complete draft without overwriting later edits", () => {
    let latest: ReturnType<typeof useChatConversationState> | undefined;
    const attachment = {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "failure.txt",
      kind: "document" as const,
      mimeType: "text/plain",
      sizeBytes: 42,
      sha256: "a".repeat(64),
    };
    const capsule = {
      kind: "terminal" as const,
      path: "Terminal",
      content: "<terminal_context>exit 1</terminal_context>",
    };

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          backendReady: false,
          onValue: (value) => (latest = value),
        }),
      ),
    );
    act(() => {
      latest?.setDraft("Explain the failure");
      latest?.setDraftAttachments([attachment], {
        [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
      });
      latest?.setChatContextCapsule(capsule);
    });

    let recovery: ReturnType<typeof snapshotDraftForDispatch> | undefined;
    act(() => {
      if (!latest) return;
      recovery = snapshotDraftForDispatch(
        "remote",
        {
          text: latest.draft,
          attachments: latest.draftAttachments,
          attachmentCleanup: latest.draftAttachmentCleanup,
          capsule: latest.chatContextCapsule,
        },
        latest.clearDraftForDispatch("remote"),
      );
    });
    expect(latest?.draft).toBe("");
    expect(latest?.draftAttachments).toEqual([]);
    expect(latest?.draftAttachmentCleanup).toEqual({});
    expect(latest?.chatContextCapsule).toBeNull();
    if (!recovery) throw new Error("Expected a failed-dispatch draft snapshot");

    act(() => {
      expect(latest?.restoreDraftAfterRejectedDispatch(recovery)).toBe(true);
    });
    expect(latest?.draft).toBe("Explain the failure");
    expect(latest?.draftAttachments).toEqual([attachment]);
    expect(latest?.draftAttachmentCleanup).toEqual({
      [attachment.id]: "123e4567-e89b-42d3-a456-426614174001",
    });
    expect(latest?.chatContextCapsule).toEqual(capsule);
    expect(
      composeChatContextMessage(
        latest?.draft ?? "",
        latest?.chatContextCapsule ?? null,
      ),
    ).toBe(
      "Explain the failure\n\n<terminal_context>exit 1</terminal_context>",
    );

    act(() => {
      if (!latest) return;
      recovery = snapshotDraftForDispatch(
        "remote",
        {
          text: latest.draft,
          attachments: latest.draftAttachments,
          attachmentCleanup: latest.draftAttachmentCleanup,
          capsule: latest.chatContextCapsule,
        },
        latest.clearDraftForDispatch("remote"),
      );
      latest.setDraft("A newer draft");
    });
    if (!recovery) throw new Error("Expected a failed-dispatch draft snapshot");
    act(() => {
      expect(latest?.restoreDraftAfterRejectedDispatch(recovery)).toBe(false);
    });
    expect(latest?.draft).toBe("A newer draft");
    expect(latest?.draftAttachments).toEqual([]);
    expect(latest?.draftAttachmentCleanup).toEqual({});
    expect(latest?.chatContextCapsule).toBeNull();
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
      "/sessions/messages?sessionId=remote&limit=500&offset=0",
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
      "remote-assistant",
    ]);
    expect(latest?.selectedMessages.at(-1)?.content).toBe("Recovered reply");
  });

  it("keeps history failures with their session and retries the failed session", async () => {
    const otherSession: SessionSummary = {
      ...remoteSession,
      sessionId: "other",
      title: "Other session",
    };
    desktopRequestMock
      .mockRejectedValueOnce(new Error("Remote history unavailable"))
      .mockResolvedValueOnce({ messages: [] })
      .mockRejectedValueOnce(new Error("Remote history unavailable"))
      .mockResolvedValueOnce({ messages: [] });
    let latest: ReturnType<typeof useChatConversationState> | undefined;

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          onValue: (value) => (latest = value),
          remoteSessions: [remoteSession, otherSession],
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.historyError).toBe("Remote history unavailable");

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          onValue: (value) => (latest = value),
          remoteSessions: [remoteSession, otherSession],
          selectedId: otherSession.sessionId,
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.historyError).toBe("");

    act(() =>
      root.render(
        createElement(ConversationProbe, {
          onValue: (value) => (latest = value),
          remoteSessions: [remoteSession, otherSession],
        }),
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(latest?.historyError).toBe("Remote history unavailable");

    act(() => latest?.retryHistory(remoteSession.sessionId));
    await act(async () => {
      await Promise.resolve();
    });
    expect(desktopRequestMock).toHaveBeenLastCalledWith(
      "/sessions/messages?sessionId=remote&limit=500&offset=0",
      "GET",
      undefined,
      expect.any(AbortSignal),
    );
  });

  it("loads a bounded earlier page without duplicating the newest 500 messages", async () => {
    const latestPage = Array.from({ length: 500 }, (_, index) => ({
      id: `message-${index + 2}`,
      role: "assistant" as const,
      text: `Reply ${index + 2}`,
      createdAt: `2026-08-12T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
    }));
    desktopRequestMock.mockImplementation((path: string) => {
      if (path.includes("offset=0")) {
        return Promise.resolve({
          messages: latestPage,
          hasEarlier: true,
          nextOffset: 500,
        });
      }
      return Promise.resolve({
        messages: [
          {
            id: "message-1",
            role: "user",
            text: "First message",
            createdAt: "2026-08-12T09:00:00.000Z",
          },
          latestPage[0],
        ],
        hasEarlier: false,
        nextOffset: 501,
      });
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
      await Promise.resolve();
    });
    expect(latest?.selectedMessages).toHaveLength(500);
    expect(latest?.hasEarlierMessages).toBe(true);

    await act(async () => {
      await latest?.loadEarlierHistory(remoteSession.sessionId);
    });
    expect(desktopRequestMock).toHaveBeenLastCalledWith(
      "/sessions/messages?sessionId=remote&limit=500&offset=500",
      "GET",
      undefined,
      expect.any(AbortSignal),
    );
    expect(latest?.selectedMessages).toHaveLength(501);
    expect(
      latest?.selectedMessages.filter((message) => message.id === "message-2"),
    ).toHaveLength(1);
    expect(latest?.selectedMessages[0]?.id).toBe("message-1");
    expect(latest?.hasEarlierMessages).toBe(false);
  });

  it("replaces optimistic rows one-to-one without collapsing repeated turns", () => {
    const local = [
      {
        id: "local-user-1",
        role: "user" as const,
        content: "What is this repo?",
        createdAt: "2026-08-20T08:09:38.400Z",
      },
      {
        id: "assistant:request-1",
        role: "assistant" as const,
        content: "A repository overview",
        createdAt: "2026-08-20T08:09:38.400Z",
      },
      {
        id: "local-user-2",
        role: "user" as const,
        content: "What is this repo?",
        createdAt: "2026-08-20T08:11:38.400Z",
      },
    ];
    const history = [
      {
        id: "remote-user-1",
        role: "user" as const,
        content: "What is this repo?",
        createdAt: "2026-08-20T08:09:38.419Z",
      },
      {
        id: "remote-assistant-1",
        role: "assistant" as const,
        content: "A repository overview",
        createdAt: "2026-08-20T08:09:46.528Z",
      },
    ];

    expect(mergeConversationHistory(local, history, new Set())).toEqual([
      ...history,
      local[2],
    ]);
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

  it("keeps the newest orphan retryable when history contains an older completed turn", () => {
    const local = [
      {
        id: "local-old-user",
        role: "user" as const,
        content: "Earlier prompt",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "local-new-user",
        role: "user" as const,
        content: "Newest interrupted prompt",
        createdAt: "2026-08-20T08:02:00.000Z",
      },
      {
        id: "assistant:request-newest",
        role: "assistant" as const,
        content: "",
        createdAt: "2026-08-20T08:02:00.000Z",
        pending: true,
      },
    ];
    const history = [
      {
        id: "remote-old-user",
        role: "user" as const,
        content: "Earlier prompt",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "remote-old-assistant",
        role: "assistant" as const,
        content: "Earlier completed reply",
        createdAt: "2026-08-20T08:00:01.000Z",
      },
    ];

    expect(mergeConversationHistory(local, history, new Set())).toMatchObject([
      ...history,
      {
        id: "local-new-user",
        content: "Newest interrupted prompt",
      },
      {
        id: "assistant:request-newest",
        content:
          "This response was interrupted before it finished. Retry it to continue.",
        error: true,
        pending: false,
      },
    ]);
  });

  it("removes a persisted synthetic reply once when its matched user has a canonical final", () => {
    const local = [
      {
        id: "local-user",
        role: "user" as const,
        content: "Recover this turn",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "assistant:request-recovered",
        role: "assistant" as const,
        content: "",
        createdAt: "2026-08-20T08:00:00.000Z",
        pending: true,
      },
    ];
    const history = [
      {
        id: "remote-user",
        role: "user" as const,
        content: "Recover this turn",
        createdAt: "2026-08-20T08:00:00.010Z",
      },
      {
        id: "remote-assistant",
        role: "assistant" as const,
        content: "Recovered final",
        createdAt: "2026-08-20T08:00:01.000Z",
      },
    ];

    const merged = mergeConversationHistory(local, history, new Set());
    expect(merged).toEqual(history);
    expect(
      merged.filter((message) => message.id === "assistant:request-recovered"),
    ).toHaveLength(0);
  });

  it("does not cross-correlate repeated prompt text when the newer turn has no final", () => {
    const local = [
      {
        id: "local-user-old",
        role: "user" as const,
        content: "Repeat this prompt",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "local-user-new",
        role: "user" as const,
        content: "Repeat this prompt",
        createdAt: "2026-08-20T08:05:00.000Z",
      },
      {
        id: "assistant:request-new",
        role: "assistant" as const,
        content: "",
        createdAt: "2026-08-20T08:05:00.000Z",
        pending: true,
      },
    ];
    const history = [
      {
        id: "remote-user-old",
        role: "user" as const,
        content: "Repeat this prompt",
        createdAt: "2026-08-20T08:00:00.010Z",
      },
      {
        id: "remote-assistant-old",
        role: "assistant" as const,
        content: "Older reply",
        createdAt: "2026-08-20T08:00:01.000Z",
      },
      {
        id: "remote-user-new",
        role: "user" as const,
        content: "Repeat this prompt",
        createdAt: "2026-08-20T08:05:00.010Z",
      },
    ];

    const merged = mergeConversationHistory(local, history, new Set());
    expect(merged.map((message) => message.id)).toEqual([
      "remote-user-old",
      "remote-assistant-old",
      "remote-user-new",
      "assistant:request-new",
    ]);
    expect(merged[3]).toMatchObject({
      createdAt: "2026-08-20T08:05:00.010Z",
      error: true,
      id: "assistant:request-new",
      pending: false,
    });
  });

  it("uses the canonical final as the only assistant row during an active-stream history race", () => {
    const local = [
      {
        id: "local-user",
        role: "user" as const,
        content: "Still streaming",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "assistant:request-active",
        role: "assistant" as const,
        content: "partial",
        createdAt: "2026-08-20T08:00:01.000Z",
        pending: true,
      },
    ];
    const history = [
      {
        id: "remote-user",
        role: "user" as const,
        content: "Still streaming",
        createdAt: "2026-08-20T08:00:00.010Z",
      },
      {
        id: "remote-assistant",
        role: "assistant" as const,
        content: "Finished response",
        createdAt: "2026-08-20T08:00:02.000Z",
      },
    ];

    const merged = mergeConversationHistory(
      local,
      history,
      new Set(["request-active"]),
    );
    expect(merged).toEqual(history);
    expect(merged.filter((message) => message.role === "assistant")).toEqual([
      history[1],
    ]);
    expect(
      merged.some((message) => message.id === "assistant:request-active"),
    ).toBe(false);
  });

  it("preserves a new active pair when an out-of-order history response lacks it", () => {
    const local = [
      {
        id: "local-old-user",
        role: "user" as const,
        content: "Earlier prompt",
        createdAt: "2026-08-20T08:00:00.000Z",
      },
      {
        id: "local-new-user",
        role: "user" as const,
        content: "New prompt after refresh started",
        createdAt: "2026-08-20T08:03:00.000Z",
      },
      {
        id: "assistant:request-new",
        role: "assistant" as const,
        content: "",
        createdAt: "2026-08-20T08:03:00.000Z",
        pending: true,
      },
    ];
    const history = [
      {
        id: "remote-old-user",
        role: "user" as const,
        content: "Earlier prompt",
        createdAt: "2026-08-20T08:00:00.010Z",
      },
      {
        id: "remote-old-assistant",
        role: "assistant" as const,
        content: "Earlier response",
        createdAt: "2026-08-20T08:00:01.000Z",
      },
    ];

    expect(
      mergeConversationHistory(local, history, new Set(["request-new"])),
    ).toMatchObject([
      ...history,
      {
        id: "local-new-user",
        content: "New prompt after refresh started",
      },
      {
        id: "assistant:request-new",
        pending: true,
      },
    ]);
  });
});
