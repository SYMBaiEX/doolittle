// @vitest-environment jsdom

import type { BotSummary } from "@doolittle/contracts/bots";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AttachmentSelection,
  ChatEvent,
  SessionSummary,
} from "../../shared/contracts";
import { ChatPage, type ChatPageProps } from "../ChatPage";
import type { ChatComposerProps } from "../chat/ChatComposer";
import type { ChatTranscriptProps } from "../chat/ChatTranscript";
import type { ConversationStore } from "../chat/models";
import { loadStoredChatMessages } from "../chat/useChatConversationState";
import {
  loadConversationDrafts,
  saveConversationDrafts,
  saveConversationQueue,
} from "../conversation-persistence";
import { ChatWorkspaceStore } from "./chat-workspace-store";
import {
  MAX_RETAINED_CLOSED_PANELS,
  SESSION_WORKSPACE_STORAGE_KEY,
} from "./workspace-layout";

const { narrow, request } = vi.hoisted(() => ({
  narrow: { value: false },
  request: vi.fn(),
}));
vi.mock("@elizaos/ui/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) =>
    query === "(max-width: 900px)" && narrow.value,
}));
vi.mock("../lib", () => ({
  desktopRequest: request,
  errorMessage: (value: unknown) => String(value),
}));
vi.mock("../chat/useChatComposerSupport", () => ({
  useChatComposerSupport: () => ({
    commandCatalog: { commands: [], error: "" },
    commandSuggestions: [],
    memoryMatches: { query: "", matches: [], status: "idle" },
    refreshSessionUsage: vi.fn(),
    selectCommandSuggestion: vi.fn(),
    selectedContextLabel: "0%",
    selectedContextPercent: 0,
    selectedContextTone: "neutral",
    selectedUsageError: "",
    usageLoading: "",
  }),
}));
vi.mock("../chat/useChatMessageActions", () => ({
  useChatMessageActions: () => ({
    copyMessage: vi.fn(),
    copyStates: {},
    readMessage: vi.fn(),
    speakingMessageId: "",
    speechSupported: false,
    stopSpeaking: vi.fn(),
  }),
}));
vi.mock("../components/RouteControlDialog", () => ({
  RouteControlDialog: () => null,
}));
vi.mock("../components/ThreadWorkbenchRail", () => ({
  ThreadWorkbenchRail: () => <aside>Test session context</aside>,
}));
vi.mock("../chat/ChatComposer", () => ({
  ChatComposer: (props: ChatComposerProps) => (
    <div>
      {props.workspaceNotice}
      <button onClick={() => void props.pickContextFiles()} type="button">
        Attach test
      </button>
      <span>
        {props.attachmentImporting ? "Import pending" : "Import ready"}
      </span>
      {props.attachedFiles.map((attachment) => (
        <span key={attachment.id}>{attachment.name}</span>
      ))}
      <textarea
        aria-label="Test composer"
        id={`test-composer-${props.selectedId}`}
        onInput={(event) => props.setDraft(event.currentTarget.value)}
        ref={props.composerRef}
        value={props.draft}
        readOnly
      />
      <button
        disabled={!props.canSubmit}
        onClick={() => void props.onSubmit()}
        type="button"
      >
        Send test
      </button>
      {props.queuedMessages.length > 0 ? (
        <button onClick={props.resumeQueuedMessages} type="button">
          Resume test
        </button>
      ) : null}
      {props.activeRequest ? (
        <button
          onClick={() =>
            void props.onCancelRequest(props.activeRequest as string)
          }
          type="button"
        >
          Stop test
        </button>
      ) : null}
    </div>
  ),
}));
vi.mock("../chat/ChatTranscript", () => ({
  ChatTranscript: (props: ChatTranscriptProps) => (
    <div role="log">
      {props.messages.map((message) => (
        <p key={message.id}>{message.content}</p>
      ))}
      <div ref={props.endRef} />
    </div>
  ),
}));
vi.mock("../sessions/SessionsPage", () => ({ SessionsPage: () => null }));
vi.mock("../MediaPage", () => ({ MediaPage: () => null }));

const sessions: SessionSummary[] = ["a", "b"].map((sessionId) => ({
  sessionId,
  title: `Session ${sessionId.toUpperCase()}`,
  messageCount: 0,
  participants: [],
  preview: [],
}));
const namedBot: BotSummary = {
  id: "named-bot",
  agentId: "named-agent",
  name: "Researcher",
  persona: "Research carefully",
  model: { provider: "test", model: "test-model" },
  permissions: {
    connectionIds: [],
    workspacePaths: ["/tmp/named"],
    toolIds: [],
    allowMutation: false,
    allowDelegation: false,
  },
  workspacePath: "/tmp/named",
  isDefault: false,
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
  state: "ready",
  activeRunCount: 0,
};
let root: Root;
let container: HTMLDivElement;
let listener: ((event: ChatEvent) => void) | undefined;
let selectExternal: ((id: string) => void) | undefined;
const start = vi.fn(
  async (_input: { requestId: string; roomId: string }): Promise<void> =>
    undefined,
);
const cancel = vi.fn(async () => undefined);
const subscribe = vi.fn();
function Harness({
  backend = { phase: "ready", message: "Ready" },
  remoteSessions = sessions,
  sessionMetadata,
  projects,
  workspacePath = "/tmp/shared",
  bots,
  botIdForSession,
  defaultBotId,
}: Partial<
  Pick<
    ChatPageProps,
    | "backend"
    | "remoteSessions"
    | "sessionMetadata"
    | "projects"
    | "workspacePath"
    | "bots"
    | "botIdForSession"
    | "defaultBotId"
  >
>) {
  const [selectedId, onSelect] = useState("a");
  selectExternal = onSelect;
  return (
    <ChatPage
      bots={bots}
      botIdForSession={botIdForSession}
      defaultBotId={defaultBotId}
      backend={backend}
      chromeHost={null}
      onConsumeContextHandoff={vi.fn()}
      onOpenModelsPage={vi.fn()}
      onOpenProvidersPage={vi.fn()}
      onOpenWorkspaceView={vi.fn()}
      onSelect={onSelect}
      pendingApprovals={0}
      pendingContextHandoff={null}
      refreshRuntime={vi.fn()}
      remoteSessions={remoteSessions}
      sessionMetadata={sessionMetadata}
      projects={projects}
      runningTasks={0}
      runtime={null}
      selectedId={selectedId}
      workspacePath={workspacePath}
    />
  );
}
async function render(
  props: Partial<
    Pick<
      ChatPageProps,
      | "backend"
      | "remoteSessions"
      | "sessionMetadata"
      | "projects"
      | "workspacePath"
      | "bots"
      | "botIdForSession"
      | "defaultBotId"
    >
  > = {},
) {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
}
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Expected test fixture value");
  return value;
}
function panel(id: string) {
  return required(
    container.querySelector<HTMLElement>(`[data-session-panel="${id}"]`),
  );
}
async function click(scope: ParentNode, label: string) {
  await act(async () => {
    const button = [
      ...scope.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (value) =>
        value.getAttribute("aria-label") === label ||
        value.textContent === label,
    );
    // These host-owned actions live in the single conversation header/sidebar,
    // deliberately outside this workspace-only harness.
    const hostEvent =
      label === "Find session"
        ? "doolittle:find-session"
        : label === "New session"
          ? "doolittle:new-conversation-view"
          : label.startsWith("Close ")
            ? "doolittle:close-conversation-view"
            : undefined;
    if (!button && hostEvent) {
      window.dispatchEvent(new Event(hostEvent));
      return;
    }
    expect(button, label).toBeDefined();
    button?.click();
  });
}
async function draft(id: string, value: string) {
  await act(async () => {
    const input = required(
      panel(id).querySelector<HTMLTextAreaElement>("textarea"),
    );
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function openB() {
  await click(container, "Find session");
  await click(
    required(container.querySelector("#session-workspace-finder")),
    "Session BOpen · Ready",
  );
}
async function emit(event: ChatEvent) {
  await act(async () => {
    listener?.(event);
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  narrow.value = false;
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockImplementation(async (path: string) =>
    path.startsWith("/chat/runs") ? { runs: [] } : { messages: [] },
  );
  window.doolittle = {
    platform: "darwin",
    startChat: start,
    cancelChat: cancel,
    subscribeChat: vi.fn(async () => undefined),
    onChatEvent: subscribe.mockImplementation(
      (callback: (event: ChatEvent) => void) => {
        listener = callback;
        return vi.fn();
      },
    ),
  } as unknown as typeof window.doolittle;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  globalThis.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(0), 0);
  globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  listener = undefined;
});

describe("shared session workbench behavior", () => {
  it("keeps a single conversation free of duplicate workspace controls", async () => {
    await render();
    expect(container.querySelector('[aria-label="Find session"]')).toBeNull();
    expect(container.querySelector('[aria-label="New session"]')).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    await act(async () =>
      window.dispatchEvent(new Event("doolittle:new-conversation-view")),
    );
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
  });
  it("bounds mounts and shared-store subscriptions through 50 cycles while restoring an evicted draft and scroll position", async () => {
    const read = ChatWorkspaceStore.prototype.read;
    const instrumented = new WeakSet<ChatWorkspaceStore>();
    let liveSubscriptions = 0;
    let workspace: ChatWorkspaceStore | undefined;
    const readSpy = vi
      .spyOn(ChatWorkspaceStore.prototype, "read")
      .mockImplementation(function <T>(
        this: ChatWorkspaceStore,
        key: string,
        initial: T | (() => T),
      ): T {
        if (!instrumented.has(this)) {
          instrumented.add(this);
          workspace = this;
          const subscribe = this.subscribe;
          this.subscribe = (listener) => {
            liveSubscriptions += 1;
            const unsubscribe = subscribe(listener);
            return () => {
              liveSubscriptions -= 1;
              return unsubscribe();
            };
          };
        }
        return read.call(this, key, initial) as T;
      });
    try {
      await render();
      await draft("a", "Run before closing");
      await click(panel("a"), "Send test");
      const runA = required(start.mock.calls[0])[0];
      await draft("a", "Preserved beyond the warm cache");
      const log = required(
        panel("a").querySelector<HTMLElement>('[role="log"]'),
      );
      Object.defineProperties(log, {
        scrollHeight: { value: 1000 },
        clientHeight: { value: 200 },
      });
      log.scrollTop = 120;
      await act(async () => log.dispatchEvent(new Event("scroll")));
      const appendUnread = async (id: string) => {
        await act(async () =>
          required(workspace).update<ConversationStore>(
            "conversation.messages",
            (current) => ({
              ...current,
              a: [
                ...(current.a ?? []),
                {
                  id,
                  role: "assistant",
                  content: id,
                  createdAt: "2026-10-04T00:00:00Z",
                },
              ],
            }),
          ),
        );
      };
      await appendUnread("Unread before eviction");
      expect(panel("a").textContent).toContain("1 new message");
      await act(async () =>
        window.dispatchEvent(new CustomEvent("doolittle:toggle-inspector")),
      );
      expect(panel("a").querySelector(".chat-workbench-pane")).not.toBeNull();
      await openB();
      await act(async () =>
        window.dispatchEvent(new CustomEvent("doolittle:toggle-inspector")),
      );
      expect(panel("b").querySelector(".chat-workbench-pane")).toBeNull();
      const originalB = panel("b");
      await click(container, "Close Session A view");
      let subscriptionsAtCapacity = 0;
      for (let index = 0; index < 50; index += 1) {
        const id = `cycle-${index}`;
        await act(async () => required(selectExternal)(id));
        expect(
          container.querySelectorAll("[data-session-panel]").length,
        ).toBeLessThanOrEqual(MAX_RETAINED_CLOSED_PANELS + 2);
        await click(container, "Close New session view");
        expect(
          container.querySelectorAll("[data-session-panel]").length,
        ).toBeLessThanOrEqual(MAX_RETAINED_CLOSED_PANELS + 1);
        expect(panel("b")).toBe(originalB);
        if (index === 20) subscriptionsAtCapacity = liveSubscriptions;
      }
      expect(subscriptionsAtCapacity).toBeGreaterThan(0);
      expect(liveSubscriptions).toBe(subscriptionsAtCapacity);
      expect(container.querySelector('[data-session-panel="a"]')).toBeNull();
      expect(loadConversationDrafts(localStorage).a?.text).toBe(
        "Preserved beyond the warm cache",
      );
      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(cancel).not.toHaveBeenCalled();
      await emit({
        requestId: runA.requestId,
        event: "response.completed",
        data: { response: "Completed after eviction" },
      });
      expect(
        required(workspace).read<Record<string, string>>(
          "run.active-requests",
          {},
        ).a,
      ).toBeUndefined();
      await appendUnread("Unread after eviction");
      await render({
        backend: { phase: "stopped", message: "Offline" },
        remoteSessions: [],
      });
      const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView);
      scroll.mockClear();
      await click(container, "Find session");
      const reopen = required(
        [
          ...container.querySelectorAll<HTMLButtonElement>(
            "#session-workspace-finder button",
          ),
        ].find((button) => button.textContent?.startsWith("Session A")),
      );
      await act(async () => reopen.click());
      expect(panel("a").querySelector("textarea")?.value).toBe(
        "Preserved beyond the warm cache",
      );
      expect(panel("a").textContent).toContain("Completed after eviction");
      expect(panel("a").querySelector('[role="log"]')?.scrollTop).toBe(120);
      expect(panel("a").textContent).toContain("2 new messages");
      expect(panel("a").querySelector(".chat-workbench-pane")).not.toBeNull();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
      });
      expect(scroll).not.toHaveBeenCalled();
      await act(async () => root.unmount());
      expect(liveSubscriptions).toBe(0);
      root = createRoot(container);
    } finally {
      readSpy.mockRestore();
    }
  });

  it("retains an in-flight attachment import across eviction and reopening", async () => {
    let resolveImport: ((result: AttachmentSelection) => void) | undefined;
    window.doolittle.pickChatAttachments = vi.fn(
      () =>
        new Promise<AttachmentSelection>((resolve) => {
          resolveImport = resolve;
        }),
    );
    window.doolittle.discardChatAttachments = vi.fn(async () => undefined);
    await render();
    await draft("a", "Draft awaiting its attachment");
    await click(panel("a"), "Attach test");
    expect(panel("a").textContent).toContain("Import pending");
    await click(panel("a"), "Close Session A");
    for (let index = 0; index <= MAX_RETAINED_CLOSED_PANELS; index += 1) {
      const id = `import-cycle-${index}`;
      await act(async () => required(selectExternal)(id));
      await click(panel(id), "Close New session");
    }
    expect(container.querySelector('[data-session-panel="a"]')).toBeNull();
    await act(async () => required(selectExternal)("a"));
    expect(panel("a").textContent).toContain("Import pending");
    await click(panel("a"), "Send test");
    expect(start).not.toHaveBeenCalled();
    await act(async () =>
      required(resolveImport)({
        canceled: false,
        cleanupCapability: "attachment-lease",
        attachments: [
          {
            id: "attachment-1",
            name: "context.txt",
            kind: "document",
            mimeType: "text/plain",
            sizeBytes: 12,
            sha256: "digest",
          },
        ],
      }),
    );
    expect(panel("a").textContent).toContain("Import ready");
    expect(panel("a").textContent).toContain("context.txt");
    expect(panel("a").querySelector("textarea")?.value).toBe(
      "Draft awaiting its attachment",
    );
    expect(window.doolittle.discardChatAttachments).not.toHaveBeenCalled();
  });
  it("recovers a persisted panel's project binding from full metadata outside the currently scoped list", async () => {
    const foreign = {
      ...sessions[0],
      sessionId: "foreign",
      title: "Foreign session",
      projectId: "foreign-project",
    } as SessionSummary;
    localStorage.setItem(
      SESSION_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        openIds: ["a", "foreign"],
        focusedId: "a",
        weights: {},
        mode: "tiles",
      }),
    );
    await render({
      remoteSessions: [sessions[0] as SessionSummary],
      sessionMetadata: [sessions[0] as SessionSummary, foreign],
      projects: [
        {
          id: "foreign-project",
          name: "Foreign project",
          primaryPath: "/tmp/foreign",
        },
      ],
    });
    expect(panel("foreign").textContent).toContain(
      "Activate its workspace before sending",
    );
    await draft("foreign", "Do not send into another repository");
    const send = required(
      [...panel("foreign").querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Send test",
      ),
    );
    expect(send.disabled).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });
  it("keeps app selection coherent and announces external opens that exceed the panel cap", async () => {
    localStorage.setItem(
      SESSION_WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        openIds: [
          "a",
          ...Array.from({ length: 11 }, (_, index) => `existing-${index}`),
        ],
        focusedId: "a",
        weights: {},
        mode: "tiles",
      }),
    );
    await render();
    await act(async () => selectExternal?.("external-thirteenth"));
    expect(container.textContent).toContain("Up to 12 panels can be open");
    expect(
      container.querySelector('[data-session-panel="external-thirteenth"]'),
    ).toBeNull();
    expect(
      JSON.parse(required(localStorage.getItem(SESSION_WORKSPACE_STORAGE_KEY)))
        .focusedId,
    ).toBe("a");
  });

  it("uses only the coordinator to persist a shared transcript update", async () => {
    await render();
    await openB();
    await draft("a", "A");
    await draft("b", "B");
    const save = vi.spyOn(Storage.prototype, "setItem");
    save.mockClear();
    const sendA = required(
      [...panel("a").querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Send test",
      ),
    );
    const sendB = required(
      [...panel("b").querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Send test",
      ),
    );
    await act(async () => {
      sendA.click();
      sendB.click();
    });
    expect(
      save.mock.calls.filter(
        ([key]) => key === "doolittle.desktop.conversations.v2",
      ),
    ).toHaveLength(1);
    save.mockRestore();
  });

  it("recovers existing run claims before allowing direct or queued dispatch", async () => {
    let resolve!: (value: { runs: unknown[] }) => void;
    const recovery = new Promise<{ runs: unknown[] }>((resolvePromise) => {
      resolve = resolvePromise;
    });
    request.mockImplementation(async (path: string) =>
      path.startsWith("/chat/runs") ? recovery : { messages: [] },
    );
    saveConversationQueue(localStorage, [
      {
        id: "queued-a",
        sessionId: "a",
        content: "Recovered queued turn",
        attachments: [],
        workspacePath: "/tmp/shared",
      },
    ]);
    await render();
    await draft("a", "Retained draft");
    expect(panel("a").textContent).toContain(
      "Checking active runs before sending",
    );
    const send = required(
      [...panel("a").querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Send test",
      ),
    );
    expect(send.disabled).toBe(true);
    await click(panel("a"), "Resume test");
    expect(start).not.toHaveBeenCalled();
    await act(async () =>
      resolve({
        runs: [
          {
            runId: "existing-a",
            sessionId: "a",
            source: "desktop",
            status: "thinking",
            startedAt: "2026-10-03T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(panel("a").textContent).toContain("Stop test");
    expect(start).not.toHaveBeenCalled();
    await emit({
      requestId: "existing-a",
      event: "response.completed",
      data: { response: "Recovered run finished" },
    });
    expect(start.mock.calls, panel("a").textContent ?? "").toHaveLength(1);
    expect(start.mock.calls[0]?.[0].roomId).toBe("a");
    expect(panel("a").querySelector("textarea")?.value).toBe("Retained draft");
  });

  it("opens a new independent panel immediately from the workspace toolbar", async () => {
    await render();
    await click(container, "New session");
    expect(
      [
        ...container.querySelectorAll<HTMLElement>("[data-session-panel]"),
      ].filter((value) => !value.hidden),
    ).toHaveLength(1);
    expect(
      JSON.parse(required(localStorage.getItem(SESSION_WORKSPACE_STORAGE_KEY)))
        .openIds,
    ).toHaveLength(2);
  });

  it("routes a named bot panel to its own workspace even while the lead workspace is selected", async () => {
    await render({
      bots: [namedBot],
      defaultBotId: "lead-bot",
      botIdForSession: (id) => (id === "b" ? namedBot.id : "lead-bot"),
      workspacePath: "/tmp/shared",
    });
    await openB();
    await draft("b", "Research this");
    await click(panel("b"), "Send test");
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: namedBot.id,
        workspacePath: namedBot.workspacePath,
        roomId: "b",
      }),
    );
  });

  it("holds a named bot draft when its owner is absent from the catalog", async () => {
    await render({
      bots: [],
      defaultBotId: "lead-bot",
      botIdForSession: () => namedBot.id,
    });
    await draft("a", "Keep this safe");
    expect(panel("a").textContent).toContain("bot is unavailable");
    expect(
      [...panel("a").querySelectorAll("button")].find(
        (button) => button.textContent === "Send test",
      )?.disabled,
    ).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });

  it("claims a session synchronously so two immediate submits cannot overlap its run", async () => {
    await render();
    await draft("a", "One turn");
    const send = required(
      [...panel("a").querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Send test",
      ),
    );
    await act(async () => {
      send.click();
      send.click();
    });
    expect(start).toHaveBeenCalledTimes(1);
    await emit({
      requestId: required(start.mock.calls[0])[0].requestId,
      event: "response.completed",
      data: { response: "Done" },
    });
  });

  it("does not restore a rejected dispatch over a newer draft or another panel's draft", async () => {
    let reject!: (error: Error) => void;
    start.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    await render();
    await openB();
    await draft("a", "Original A");
    await draft("b", "Unchanged B");
    await click(panel("a"), "Send test");
    await draft("a", "Newer A");
    await act(async () => reject(new Error("Dispatch rejected")));
    expect(panel("a").querySelector("textarea")?.value).toBe("Newer A");
    expect(panel("b").querySelector("textarea")?.value).toBe("Unchanged B");
    expect(panel("a").textContent).toContain("Dispatch rejected");
  });

  it("streams two independent sessions through one coordinator and cancels only the requested run", async () => {
    await render();
    await openB();
    await draft("a", "Prompt A");
    await draft("b", "Prompt B");
    expect(panel("a").querySelector("textarea")?.value).toBe("Prompt A");
    await click(panel("a"), "Send test");
    await click(panel("b"), "Send test");
    expect(start).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledTimes(1);
    const [runA, runB] = start.mock.calls.map((call) => call[0]);
    expect([runA?.roomId, runB?.roomId]).toEqual(["a", "b"]);
    await emit({
      requestId: required(runA).requestId,
      event: "response.output_text.delta",
      data: { delta: "Only A" },
    });
    await emit({
      requestId: required(runB).requestId,
      event: "response.output_text.delta",
      data: { delta: "Only B" },
    });
    expect(panel("a").textContent).toContain("Only A");
    expect(panel("a").textContent).not.toContain("Only B");
    expect(panel("b").textContent).toContain("Only B");
    await click(panel("a"), "Stop test");
    expect(cancel).toHaveBeenCalledWith(required(runA).requestId, undefined);
    await emit({
      requestId: required(runA).requestId,
      event: "response.cancelled",
      data: {},
    });
    expect(panel("a").textContent).not.toContain("Stop test");
    expect(panel("b").textContent).toContain("Stop test");
    await click(container, "Close Session B view");
    expect(panel("b").hidden).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
    await emit({
      requestId: required(runB).requestId,
      event: "response.completed",
      data: { response: "B finished while closed" },
    });
    await click(container, "Find session");
    const reopen = required(
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          "#session-workspace-finder button",
        ),
      ].find((button) => button.textContent?.startsWith("Session B")),
    );
    await act(async () => reopen.click());
    expect(panel("b").hidden).toBe(false);
    expect(panel("b").textContent).toContain("B finished while closed");
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("closes the final view, retains its unsent draft, and reopens without cancelling", async () => {
    await render();
    await draft("a", "Unsent draft");
    await click(panel("a"), "Close Session A");
    expect(container.textContent).toContain("No open panels");
    expect(panel("a").hidden).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    await click(container, "Find session");
    const reopen = required(
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          "#session-workspace-finder button",
        ),
      ].find((button) => button.textContent?.startsWith("Session A")),
    );
    await act(async () => reopen.click());
    expect(panel("a").querySelector("textarea")?.value).toBe("Unsent draft");
  });

  it.each(["", "Draft written before history arrives"])(
    "finds a closed view offline with draft %j while its uncached history is pending",
    async (unsentDraft) => {
      request.mockImplementation((path: string) =>
        path.startsWith("/sessions/messages")
          ? new Promise(() => {})
          : Promise.resolve(path.startsWith("/chat/runs") ? { runs: [] } : {}),
      );
      await render();
      expect(request).toHaveBeenCalledWith(
        expect.stringContaining("/sessions/messages?sessionId=a"),
        "GET",
        undefined,
        expect.any(AbortSignal),
        undefined,
        undefined,
      );
      if (unsentDraft) await draft("a", unsentDraft);
      await click(panel("a"), "Close Session A");
      await render({
        backend: { phase: "stopped", message: "Offline" },
        remoteSessions: [],
      });
      expect(loadStoredChatMessages(localStorage)).not.toHaveProperty("a");
      expect(container.textContent).toContain("No open panels");
      await click(container, "Find session");
      const reopen = required(
        [
          ...container.querySelectorAll<HTMLButtonElement>(
            "#session-workspace-finder button",
          ),
        ].find((button) => button.textContent?.startsWith("Session A")),
      );
      await act(async () => reopen.click());
      expect(panel("a").hidden).toBe(false);
      expect(panel("a").querySelector("textarea")?.value).toBe(unsentDraft);
      expect(start).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it("finds a persisted draft without a loaded summary, transcript, or retained view", async () => {
    saveConversationDrafts(localStorage, {
      orphan: { text: "Saved unsent draft", capsule: null, attachments: [] },
    });
    await render({ backend: { phase: "stopped", message: "Offline" } });
    expect(container.querySelector('[data-session-panel="orphan"]')).toBeNull();
    expect(loadStoredChatMessages(localStorage)).not.toHaveProperty("orphan");
    await click(container, "Find session");
    const reopen = required(
      [
        ...container.querySelectorAll<HTMLButtonElement>(
          "#session-workspace-finder button",
        ),
      ].find((button) => button.textContent?.startsWith("New session")),
    );
    await act(async () => reopen.click());
    expect(panel("orphan").querySelector("textarea")?.value).toBe(
      "Saved unsent draft",
    );
    expect(start).not.toHaveBeenCalled();
  });

  it("persists keyboard resize/order and switches to a deliberate roving tabbed narrow layout", async () => {
    await render();
    await openB();
    await act(async () => {
      required(container.querySelector<HTMLElement>("summary")).click();
    });
    await click(container, "Split right");
    const separator = required(
      container.querySelector<HTMLElement>("[data-session-resizer]"),
    );
    await act(async () =>
      separator.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    const stored = JSON.parse(
      required(localStorage.getItem(SESSION_WORKSPACE_STORAGE_KEY)),
    );
    expect(stored.tree.ratio).toBeCloseTo(0.55);
    await click(panel("b"), "Move Session B left");
    expect(
      JSON.parse(required(localStorage.getItem(SESSION_WORKSPACE_STORAGE_KEY)))
        .openIds,
    ).toEqual(["b", "a"]);
    await draft("a", "Narrow draft A");
    narrow.value = true;
    await render();
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(container.querySelector("[data-session-resizer]")).toBeNull();
    const current = required(
      container.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      ),
    );
    await act(async () =>
      current.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(panel("a").hidden).toBe(true);
    expect(panel("b").hidden).toBe(false);
    expect(panel("a").querySelector("textarea")?.value).toBe("Narrow draft A");
    expect(document.activeElement?.id).toBe("session-tab-b");
  });
});
