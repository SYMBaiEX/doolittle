// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CommandCatalogResponse,
  SessionUsageSummary,
} from "../../shared/contracts";
import {
  type ChatComposerSupportState,
  useChatComposerSupport,
} from "./useChatComposerSupport";

const { desktopRequestMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
}));

vi.mock("../lib", () => ({
  desktopRequest: desktopRequestMock,
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

function usageResponse(percent: number): { usage: SessionUsageSummary } {
  return {
    usage: {
      sessionId: "session-1",
      messageCount: 2,
      userMessages: 1,
      assistantMessages: 1,
      systemMessages: 0,
      characterCount: 100,
      estimatedTokens: 25,
      context: {
        estimatedTokens: 25,
        contextWindowTokens: 100,
        usageFraction: percent / 100,
        percent,
        overThreshold: percent >= 70,
        estimated: true,
        sampledMessages: 2,
        totalMessages: 2,
        truncated: false,
        provider: "test",
        model: "test-model",
      },
    },
  };
}

const commandCatalog: CommandCatalogResponse = {
  commands: [
    {
      command: "/help",
      category: "general",
      description: "Show help",
    },
  ],
};

let latest: ChatComposerSupportState | undefined;
const composerRef = { current: null };
const setCommandMenuDismissed = vi.fn();
const setDraft = vi.fn();
const setQueueAnnouncement = vi.fn();

function Probe({
  backendReady = true,
  commandMenuDismissed = false,
  draft,
  selectedId = "session-1",
  workspacePath,
}: {
  backendReady?: boolean;
  commandMenuDismissed?: boolean;
  draft: string;
  selectedId?: string;
  workspacePath?: string;
}) {
  latest = useChatComposerSupport({
    backendReady,
    commandMenuDismissed,
    composerRef,
    draft,
    selectedId,
    setCommandMenuDismissed,
    setDraft,
    setQueueAnnouncement,
    workspacePath,
  });
  return null;
}

describe("useChatComposerSupport", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    desktopRequestMock.mockReset();
    setCommandMenuDismissed.mockReset();
    setDraft.mockReset();
    setQueueAnnouncement.mockReset();
    latest = undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("ignores stale memory recall results", async () => {
    const firstRecall = deferred<{
      hits: Array<{ kind: string; value: string }>;
    }>();
    const secondRecall = deferred<{
      hits: Array<{ kind: string; value: string }>;
    }>();
    desktopRequestMock.mockImplementation((path: string) => {
      if (path === "/commands/catalog") return Promise.resolve(commandCatalog);
      if (path.startsWith("/sessions/usage")) {
        return Promise.resolve(usageResponse(25));
      }
      if (path.includes("first%20question")) return firstRecall.promise;
      if (path.includes("second%20question")) return secondRecall.promise;
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await act(async () => {
      root.render(<Probe draft="first question" />);
    });
    act(() => vi.advanceTimersByTime(380));
    await act(async () => {
      root.render(<Probe draft="second question" />);
    });
    act(() => vi.advanceTimersByTime(380));

    await act(async () => {
      secondRecall.resolve({
        hits: [{ kind: "preference", value: "Use the current answer" }],
      });
      await secondRecall.promise;
    });
    expect(latest?.memoryMatches).toMatchObject({
      query: "second question",
      matches: [{ kind: "preference", value: "Use the current answer" }],
      status: "ready",
    });

    await act(async () => {
      firstRecall.resolve({
        hits: [{ kind: "preference", value: "Ignore this stale answer" }],
      });
      await firstRecall.promise;
    });
    expect(latest?.memoryMatches).toMatchObject({
      query: "second question",
      matches: [{ kind: "preference", value: "Use the current answer" }],
      status: "ready",
    });
  });

  it("keeps the newest usage refresh when requests resolve out of order", async () => {
    const initialUsage = deferred<{ usage: SessionUsageSummary }>();
    const refreshedUsage = deferred<{ usage: SessionUsageSummary }>();
    let usageCalls = 0;
    desktopRequestMock.mockImplementation((path: string) => {
      if (path === "/commands/catalog") return Promise.resolve(commandCatalog);
      if (path.startsWith("/sessions/usage")) {
        usageCalls += 1;
        return usageCalls === 1 ? initialUsage.promise : refreshedUsage.promise;
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await act(async () => {
      root.render(<Probe draft="/help" />);
    });
    expect(latest).toBeDefined();
    await act(async () => {
      void latest?.refreshSessionUsage("session-1");
    });

    await act(async () => {
      refreshedUsage.resolve(usageResponse(88));
      await refreshedUsage.promise;
    });
    expect(latest?.selectedContextPercent).toBe(88);
    expect(latest?.selectedContextTone).toBe("bad");

    await act(async () => {
      initialUsage.resolve(usageResponse(12));
      await initialUsage.promise;
    });
    expect(latest?.selectedContextPercent).toBe(88);
    expect(latest?.selectedContextLabel).toBe("88%");
  });

  it("refreshes workspace-specific command completions after a live workspace switch", async () => {
    const catalogA: CommandCatalogResponse = {
      commands: [
        {
          command: "/workflow alpha",
          category: "workspace",
          description: "Alpha workflow",
        },
      ],
    };
    const catalogB: CommandCatalogResponse = {
      commands: [
        {
          command: "/workflow beta",
          category: "workspace",
          description: "Beta workflow",
        },
      ],
    };
    let catalogCalls = 0;
    desktopRequestMock.mockImplementation((path: string) => {
      if (path === "/commands/catalog") {
        catalogCalls += 1;
        return Promise.resolve(catalogCalls === 1 ? catalogA : catalogB);
      }
      if (path.startsWith("/sessions/usage")) {
        return Promise.resolve(usageResponse(25));
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await act(async () => {
      root.render(<Probe draft="/workflow" workspacePath="/work/alpha" />);
      await Promise.resolve();
    });
    expect(latest?.commandCatalog.commands).toEqual(catalogA.commands);

    await act(async () => {
      root.render(<Probe draft="/workflow" workspacePath="/work/beta" />);
      await Promise.resolve();
    });

    expect(catalogCalls).toBe(2);
    expect(latest?.commandCatalog.commands).toEqual(catalogB.commands);
  });

  it("surfaces catalog, usage, and memory errors without leaking stale state", async () => {
    desktopRequestMock.mockImplementation((path: string) => {
      if (path === "/commands/catalog") {
        return Promise.reject(new Error("catalog offline"));
      }
      if (path.startsWith("/sessions/usage")) {
        return Promise.reject(new Error("usage offline"));
      }
      if (path.startsWith("/profiles/users/recall")) {
        return Promise.reject(new Error("recall offline"));
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await act(async () => {
      root.render(<Probe draft="remember this request" />);
    });
    act(() => vi.advanceTimersByTime(380));
    await act(async () => {
      await Promise.resolve();
    });

    expect(latest?.commandCatalog).toEqual({
      commands: [],
      error: "Command catalog unavailable: catalog offline",
    });
    expect(latest?.selectedUsageError).toBe("usage offline");
    expect(latest?.selectedContextLabel).toBe("—");
    expect(latest?.memoryMatches).toMatchObject({
      query: "remember this request",
      matches: [],
      status: "error",
    });
  });

  it("preserves command filtering and disabled-command feedback", async () => {
    desktopRequestMock.mockImplementation((path: string) => {
      if (path === "/commands/catalog") {
        return Promise.resolve({
          commands: [
            ...commandCatalog.commands,
            {
              command: "/hidden",
              category: "general",
              description: "Unavailable",
              disabledReason: "Enable the provider first.",
            },
          ],
        });
      }
      if (path.startsWith("/sessions/usage")) {
        return Promise.resolve(usageResponse(25));
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await act(async () => {
      root.render(<Probe draft="/h" />);
    });
    expect(latest?.commandSuggestions.map((entry) => entry.command)).toEqual([
      "/help",
      "/hidden",
    ]);

    const disabledCommand = latest?.commandSuggestions[1];
    expect(disabledCommand).toBeDefined();
    if (disabledCommand) {
      act(() => latest?.selectCommandSuggestion(disabledCommand));
    }
    expect(setQueueAnnouncement).toHaveBeenCalledWith(
      "Enable the provider first.",
    );
    expect(setDraft).not.toHaveBeenCalled();

    const enabledCommand = latest?.commandSuggestions[0];
    expect(enabledCommand).toBeDefined();
    if (enabledCommand) {
      act(() => latest?.selectCommandSuggestion(enabledCommand));
    }
    expect(setDraft).toHaveBeenCalledWith("/help");
    expect(setCommandMenuDismissed).toHaveBeenCalledWith(true);
  });
});
