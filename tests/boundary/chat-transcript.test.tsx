// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ChatMessage } from "../../apps/desktop/src/renderer/chat/ChatMessage";
import {
  ChatTranscript,
  type ChatTranscriptProps,
} from "../../apps/desktop/src/renderer/chat/ChatTranscript";
import { getMessageActions } from "../../apps/desktop/src/renderer/chat/MessageActions";
import type { DisplayMessage } from "../../apps/desktop/src/renderer/chat/models";
import { ChatWorkspaceProvider } from "../../apps/desktop/src/renderer/session-workspace/chat-workspace-store";
import type { DesktopRunUpdate } from "../../apps/desktop/src/shared/contracts";

vi.mock(
  import("../../apps/desktop/src/renderer/chat/ChatMessage"),
  async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, ChatMessage: vi.fn(actual.ChatMessage) };
  },
);

const response: DisplayMessage = {
  id: "assistant:run",
  role: "assistant",
  content: "The current response.",
  createdAt: "2026-11-20T10:00:00Z",
};

it("opens the recent transcript first and preserves expanded history when a pane remounts", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onLoadEarlier = vi.fn();
  const noop = () => {};
  const messages: DisplayMessage[] = Array.from(
    { length: 120 },
    (_, index) => ({
      ...response,
      id: `message-${index}`,
      content: `Turn ${index}.`,
    }),
  );
  messages[20] = {
    ...messages[20],
    role: "user",
    attachments: [
      {
        id: "archive-note",
        name: "Archived note.txt",
        kind: "document",
        mimeType: "text/plain",
        sizeBytes: 9,
        sha256: "a".repeat(64),
      },
    ],
  };
  const props: ChatTranscriptProps = {
    sessionId: "long-conversation",
    backendReady: true,
    activeRequest: null,
    loading: false,
    historyError: "",
    messages,
    runReceipts: {},
    progress: "",
    endRef: createRef<HTMLDivElement>(),
    forkingMessageId: "",
    copyStates: {},
    speakingMessageId: "",
    speechSupported: false,
    onBranch: noop,
    onCopy: noop,
    onRead: noop,
    onRetryHistory: noop,
    onStopReading: noop,
    onSelectPrompt: noop,
    hasEarlierMessages: true,
    onLoadEarlier,
  };
  const render = (present: boolean, current = messages) => {
    act(() => {
      root.render(
        <ChatWorkspaceProvider>
          {present && <ChatTranscript {...props} messages={current} />}
        </ChatWorkspaceProvider>,
      );
    });
  };
  const visibleRows = () => container.querySelectorAll("[data-message-role]");

  try {
    render(true);
    expect(visibleRows()).toHaveLength(50);
    expect(visibleRows()[0].textContent).toContain("Turn 70.");
    expect(visibleRows()[49].textContent).toContain("Turn 119.");
    const transcript = container.querySelector<HTMLElement>('[role="log"]');
    const loadEarlier = container.querySelector<HTMLButtonElement>(
      '[aria-label="Load earlier messages"]',
    );
    if (!transcript || !loadEarlier)
      throw new Error("Earlier history is missing.");
    let insertedHeight = 0;
    transcript.scrollTop = 25;
    const oldFirstRow = visibleRows()[0];
    vi.spyOn(oldFirstRow, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 30 + insertedHeight - transcript.scrollTop, 100, 80),
    );
    act(() => {
      loadEarlier.click();
      insertedHeight = 500;
    });
    expect(transcript.scrollTop).toBe(525);
    expect(onLoadEarlier).not.toHaveBeenCalled();
    expect(visibleRows()).toHaveLength(100);
    expect(visibleRows()[50]).toBe(oldFirstRow);
    expect(visibleRows()[0].textContent).toContain("Archived note.txt");

    render(false);
    render(true, [
      ...messages,
      { ...response, id: "message-new", pending: true, content: "Streaming." },
    ]);
    expect(visibleRows()).toHaveLength(101);
    expect(visibleRows()[0].textContent).toContain("Archived note.txt");
    expect(visibleRows()[100].textContent).toContain("Streaming.");
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

it("retries the earlier page without replacing the current transcript or losing its scroll position", async () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const endRef = createRef<HTMLDivElement>();
  const noop = () => {};
  let completePage: (() => void) | undefined;
  let insertedHeight = 0;
  const page = new Promise<void>((resolve) => {
    completePage = resolve;
  });
  const onLoadEarlier = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("History service unavailable"))
    .mockReturnValue(page);
  const onRetryHistory = vi.fn();
  const props = {
    sessionId: "conversation-a",
    backendReady: true,
    activeRequest: null,
    loading: false,
    historyError: "",
    runReceipts: {},
    progress: "",
    endRef,
    forkingMessageId: "",
    copyStates: {},
    speakingMessageId: "",
    speechSupported: false,
    onBranch: noop,
    onCopy: noop,
    onRead: noop,
    onRetryHistory,
    onStopReading: noop,
    onSelectPrompt: noop,
    onLoadEarlier,
  };

  try {
    act(() => {
      root.render(
        <ChatTranscript {...props} hasEarlierMessages messages={[response]} />,
      );
    });
    const transcript = container.querySelector<HTMLElement>('[role="log"]');
    const row = container.querySelector<HTMLElement>("[data-message-role]");
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Load earlier messages"]',
    );
    if (!transcript || !row || !button)
      throw new Error("Transcript is missing.");
    transcript.scrollTop = 20;
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 50 + insertedHeight - transcript.scrollTop, 100, 80),
    );

    await act(async () => button.click());
    expect(transcript.textContent).toContain(response.content);
    expect(transcript.querySelector('[role="alert"]')?.textContent).toBe(
      "Earlier messages could not be loaded.",
    );
    expect(button.getAttribute("aria-label")).toBe(
      "Retry loading earlier messages",
    );

    act(() => button.click());
    transcript.scrollTop = 40;
    insertedHeight = 90;
    await act(async () => {
      root.render(
        <ChatTranscript
          {...props}
          messages={[
            {
              id: "earlier",
              role: "user",
              content: "An earlier prompt.",
              createdAt: "2026-11-20T09:00:00Z",
            },
            response,
          ]}
        />,
      );
      completePage?.();
    });

    expect(transcript.scrollTop).toBe(130);
    expect(transcript.style.getPropertyValue("overflow-anchor")).toBe("");
    expect(onLoadEarlier).toHaveBeenCalledTimes(2);
    expect(onRetryHistory).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

it("keeps retry available when a failed response cannot be forked", () => {
  const onBranch = vi.fn();
  const actions = getMessageActions({
    message: { ...response, error: true },
    backendReady: true,
    activeRequest: null,
    forkingMessageId: "",
    speechSupported: false,
    speakingMessageId: "",
    onBranch,
    onCopy: vi.fn(),
    onRead: vi.fn(),
    onStopReading: vi.fn(),
  });

  expect(actions.find((action) => action.id === "fork")?.disabled).toBe(true);
  const retry = actions.find((action) => action.id === "retry");
  expect(retry?.disabled).toBe(false);
  retry?.onSelect();
  expect(onBranch).toHaveBeenCalledWith(
    expect.objectContaining({ id: response.id }),
    "retry",
  );
});

it("updates the streaming row while settled rows retain current actions", async () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const settled: DisplayMessage = {
    id: "previous",
    role: "user",
    content: "An earlier prompt.",
    createdAt: response.createdAt,
  };
  const pending = { ...response, pending: true, content: "" };
  const firstCopy = vi.fn();
  const currentCopy = vi.fn();
  const messageRender = vi.mocked(ChatMessage);
  const props = {
    sessionId: "conversation-a",
    backendReady: true,
    activeRequest: "run",
    loading: false,
    historyError: "",
    runReceipts: {},
    progress: "",
    endRef: createRef<HTMLDivElement>(),
    forkingMessageId: "",
    copyStates: {},
    speakingMessageId: "",
    speechSupported: false,
  };
  const render = (
    messages: DisplayMessage[],
    copy: (message: DisplayMessage) => void,
  ) => {
    act(() => {
      root.render(
        <ChatTranscript
          {...props}
          messages={messages}
          onBranch={() => {}}
          onCopy={(message) => copy(message)}
          onRead={() => {}}
          onRetryHistory={() => {}}
          onRetryMessage={() => {}}
          onStopReading={() => {}}
          onSelectPrompt={() => {}}
        />,
      );
    });
  };

  try {
    const messages = [settled, pending];
    render(messages, firstCopy);
    const transcript = container.querySelector<HTMLElement>('[role="log"]');
    expect(transcript?.getAttribute("aria-live")).toBe("off");
    expect(transcript?.hasAttribute("aria-relevant")).toBe(false);
    messageRender.mockClear();
    render(messages, currentCopy);
    expect(messageRender).not.toHaveBeenCalled();

    render(
      [settled, { ...pending, content: "New streamed text." }],
      currentCopy,
    );
    expect(messageRender).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("New streamed text.");

    const prompt = container.querySelector<HTMLElement>(
      'article[data-message-role="user"]',
    );
    const authorId = prompt?.getAttribute("aria-labelledby")?.split(" ")[0];
    expect(authorId && document.getElementById(authorId)?.textContent).toBe(
      "You",
    );
    const copy = prompt?.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy message"]',
    );
    if (!copy) throw new Error("Original message controls are missing.");
    act(() => copy.click());
    expect(currentCopy).toHaveBeenCalledWith(settled);
    expect(firstCopy).not.toHaveBeenCalled();

    const more = container.querySelector<HTMLButtonElement>(
      'button[aria-label="More message actions"]',
    );
    if (!more) throw new Error("The message menu is missing.");
    await act(async () => more.click());
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const menu = document.querySelector('[role="menu"]');
    const edit = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].find(
      (item) => item.textContent === "Edit in a new branch",
    );
    expect(edit?.getAttribute("aria-disabled")).toBe("true");
    expect(
      menu?.querySelector('[role="menuitem"]:not([aria-disabled])')
        ?.textContent,
    ).toBe("Copy message");
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

it("streams active tool receipts into the pending transcript row", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const now = Date.now();
  const startedAt = new Date(now - 8_000).toISOString();
  const update = (
    type: DesktopRunUpdate["type"],
    updatedAt: string,
    runFields: Partial<DesktopRunUpdate["run"]>,
    activity?: DesktopRunUpdate["activity"],
  ): DesktopRunUpdate => ({
    type,
    sessionId: "conversation-a",
    ...(activity ? { activity } : {}),
    run: {
      runId: "run",
      sessionId: "conversation-a",
      roomId: "conversation-a",
      source: "desktop",
      message: "",
      runDepth: "standard",
      configuredMaxIterations: 4,
      observedActionCount: 0,
      progressMode: "all",
      status: "thinking",
      localMutations: [],
      pendingApprovals: 0,
      startedAt,
      updatedAt,
      ...runFields,
    },
  });
  const started = update("started", startedAt, {});
  const actionStarted = update(
    "action-started",
    new Date(now).toISOString(),
    {
      status: "acting",
      activeAction: "READ_FILE",
      lastAction: "READ_FILE",
      observedActionCount: 1,
    },
    { action: "READ_FILE", phase: "running" },
  );
  const pendingMessage: DisplayMessage = {
    ...response,
    id: "assistant:run",
    runId: "run",
    content: "",
    pending: true,
  };
  const noop = () => {};
  const render = (receipt: {
    latest: DesktopRunUpdate;
    events: DesktopRunUpdate[];
  }) => {
    act(() => {
      root.render(
        <ChatTranscript
          sessionId="conversation-a"
          backendReady
          activeRequest="run"
          loading={false}
          historyError=""
          messages={[pendingMessage]}
          runReceipts={{ run: receipt }}
          progress=""
          endRef={createRef<HTMLDivElement>()}
          forkingMessageId=""
          copyStates={{}}
          speakingMessageId=""
          speechSupported={false}
          onBranch={noop}
          onCopy={noop}
          onRead={noop}
          onRetryHistory={noop}
          onStopReading={noop}
          onSelectPrompt={noop}
        />,
      );
    });
  };

  try {
    render({ latest: started, events: [started] });
    expect(
      container
        .querySelector('section[aria-label="Run receipt"] > button')
        ?.getAttribute("aria-label"),
    ).toBe("Planning");

    render({
      latest: actionStarted,
      events: [started, actionStarted],
    });
    expect(
      container
        .querySelector('section[aria-label="Run receipt"] > button')
        ?.getAttribute("aria-label"),
    ).toBe("Reading file");
    expect(container.textContent).not.toContain("Run complete");
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});
