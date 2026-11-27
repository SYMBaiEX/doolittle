// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHistorySidebar } from "../../apps/desktop/src/renderer/app-shell/ChatHistorySidebar";
import type { RunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import {
  apiResourceCacheKey,
  desktopQueryClient,
} from "../../apps/desktop/src/renderer/lib";
import {
  ChatWorkspaceProvider,
  type ChatWorkspaceStore,
  useChatWorkspaceStore,
} from "../../apps/desktop/src/renderer/session-workspace/chat-workspace-store";
import { SessionListPanel } from "../../apps/desktop/src/renderer/sessions/SessionListPanel";
import type {
  DesktopRunUpdate,
  SessionSummary,
} from "../../apps/desktop/src/shared/contracts";

function conversation(
  sessionId: string,
  fields?: Partial<SessionSummary>,
): SessionSummary {
  return {
    sessionId,
    title: sessionId,
    participants: [],
    messageCount: 1,
    preview: [],
    endedAt: "2026-11-25T19:04:00.000Z",
    ...fields,
  };
}

function receipt(
  runId: string,
  sessionId: string,
  fields?: Partial<DesktopRunUpdate["run"]>,
): RunReceipt {
  return {
    latest: {
      type: "action-started",
      sessionId,
      run: {
        runId,
        sessionId,
        roomId: sessionId,
        source: "desktop",
        message: "",
        runDepth: "standard",
        configuredMaxIterations: 4,
        observedActionCount: 0,
        progressMode: "all",
        status: "acting",
        localMutations: [],
        pendingApprovals: 0,
        startedAt: "2026-11-20T00:00:00Z",
        updatedAt: "2026-11-20T00:01:00Z",
        ...fields,
      },
    },
    events: [],
  };
}

function StoreProbe({
  onStore,
}: {
  onStore: (store: ChatWorkspaceStore) => void;
}) {
  const store = useChatWorkspaceStore();
  if (store) onStore(store);
  return null;
}

describe("session attention row markers", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  let host: HTMLElement;
  let root: ReturnType<typeof createRoot>;
  let store: ChatWorkspaceStore | undefined;

  beforeEach(() => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    desktopQueryClient.clear();
    localStorage.clear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    store = undefined;
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    desktopQueryClient.clear();
    localStorage.clear();
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
    document.body.innerHTML = "";
  });

  function renderSidebar(sessions: SessionSummary[]) {
    act(() =>
      root.render(
        <ChatWorkspaceProvider>
          <StoreProbe onStore={(found) => (store = found)} />
          <ChatHistorySidebar
            filtered={false}
            onOpenSession={vi.fn()}
            projects={[]}
            selectedSession=""
            sessions={sessions}
            showingGroups={false}
          />
        </ChatWorkspaceProvider>,
      ),
    );
  }

  function renderSessionList(sessions: SessionSummary[]) {
    act(() =>
      root.render(
        <ChatWorkspaceProvider>
          <StoreProbe onStore={(found) => (store = found)} />
          <SessionListPanel
            active
            onSelect={vi.fn()}
            sessions={sessions}
            selectedId=""
          />
        </ChatWorkspaceProvider>,
      ),
    );
  }

  function marks(): HTMLElement[] {
    return [...host.querySelectorAll<HTMLElement>(".session-attention-mark")];
  }

  function rowMark(kind: string): HTMLElement | undefined {
    return marks().find(
      (mark) =>
        mark.dataset.kind === kind && mark.closest("[role='tooltip']") === null,
    );
  }

  it("stays quiet when no run or input evidence exists", () => {
    renderSidebar([conversation("session-a")]);
    expect(marks()).toEqual([]);
  });

  it("marks a sidebar row working while its run is active", () => {
    renderSidebar([conversation("session-a"), conversation("session-b")]);
    act(() => {
      store?.update("run.active-requests", { "session-a": "run-a" });
      store?.update("run.receipts", {
        "run-a": receipt("run-a", "session-a"),
      });
    });
    expect(rowMark("working")).toBeDefined();
    expect(
      marks().filter((mark) => mark.dataset.kind === "working"),
    ).toHaveLength(1);
  });

  it("marks a sidebar row needs-input when its run reports pending approvals", () => {
    renderSidebar([conversation("session-a")]);
    act(() => {
      store?.update("run.active-requests", { "session-a": "run-a" });
      store?.update("run.receipts", {
        "run-a": receipt("run-a", "session-a", { pendingApprovals: 1 }),
      });
    });
    expect(rowMark("needs-input")).toBeDefined();
  });

  it("clears the marker once the run settles", () => {
    renderSidebar([conversation("session-a")]);
    act(() => {
      store?.update("run.active-requests", { "session-a": "run-a" });
      store?.update("run.receipts", {
        "run-a": receipt("run-a", "session-a"),
      });
    });
    expect(rowMark("working")).toBeDefined();
    act(() => {
      store?.update("run.active-requests", {});
      store?.update("run.receipts", {
        "run-a": receipt("run-a", "session-a", { status: "complete" }),
      });
    });
    expect(marks()).toEqual([]);
  });

  it("marks a row needs-input from the already-cached approvals payload", () => {
    renderSidebar([conversation("session-a")]);
    const key = apiResourceCacheKey("/execution/approvals?status=pending", [
      "ready",
    ]);
    act(() => {
      if (!key) throw new Error("Missing approvals cache key");
      desktopQueryClient.setQueryData([key], {
        approvals: [
          { id: "ap-1", status: "pending", roomId: "session-a" },
          { id: "ap-2", status: "approved", roomId: "session-a" },
        ],
      });
    });
    expect(rowMark("needs-input")).toBeDefined();
  });

  it("ignores cached approvals for other sessions", () => {
    renderSidebar([conversation("session-a")]);
    const key = apiResourceCacheKey("/execution/approvals?status=pending", [
      "ready",
    ]);
    act(() => {
      if (!key) throw new Error("Missing approvals cache key");
      desktopQueryClient.setQueryData([key], {
        approvals: [{ id: "ap-1", status: "pending", roomId: "session-b" }],
      });
    });
    expect(marks()).toEqual([]);
  });

  it("marks session list rows working while their run is active", () => {
    renderSessionList([conversation("session-a")]);
    act(() => {
      store?.update("run.active-requests", { "session-a": "run-a" });
      store?.update("run.receipts", {
        "run-a": receipt("run-a", "session-a"),
      });
    });
    const row = host.querySelector("[data-session-row='true']");
    expect(
      row?.querySelector(".session-attention-mark")?.getAttribute("data-kind"),
    ).toBe("working");
  });

  it("keeps session list rows quiet without evidence", () => {
    renderSessionList([conversation("session-a")]);
    expect(marks()).toEqual([]);
  });
});
