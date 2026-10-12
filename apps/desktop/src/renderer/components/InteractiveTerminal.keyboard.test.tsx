// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  InteractiveTerminalSession,
  InteractiveTerminalStartResult,
} from "../../shared/contracts";
import { InteractiveTerminal } from "./InteractiveTerminal";
import {
  createInteractiveTerminalTab,
  loadInteractiveTerminalState,
  saveInteractiveTerminalState,
} from "./interactive-terminal-store";

const typography = vi.hoisted(() => ({
  fontFamilies: [] as string[],
  focusCount: 0,
  onData: null as ((data: string) => void) | null,
  resize: null as ResizeObserverCallback | null,
  terminal: null as { cols: number; rows: number } | null,
}));
const PENDING_WARNING_TEXT = "Shell creation is unconfirmed";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    options = {};
    input?: HTMLTextAreaElement;
    constructor(options: { fontFamily: string }) {
      typography.fontFamilies.push(options.fontFamily);
      typography.terminal = this;
    }
    open(viewport: HTMLDivElement) {
      this.input = document.createElement("textarea");
      this.input.className = "xterm-helper-textarea";
      viewport.append(this.input);
    }
    focus() {
      typography.focusCount++;
      this.input?.focus();
    }
    dispose() {
      this.input?.remove();
    }
    loadAddon() {}
    write() {}
    onData(callback: (data: string) => void) {
      typography.onData = callback;
      return {
        dispose() {
          if (typography.onData === callback) typography.onData = null;
        },
      };
    }
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("../lib", () => ({
  desktopRequest: vi.fn(async () => ({ sessions: [] })),
  errorMessage: (error: unknown) => String(error),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("interactive terminal keyboard focus", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let frames: Map<number, FrameRequestCallback>;
  let style: HTMLStyleElement;
  let outsideButton: HTMLButtonElement;

  const workspacePath = "/synthetic/keyboard-workspace";

  async function renderTerminal({
    active = true,
    autoStart = false,
    workspace = workspacePath,
    botId = "synthetic-bot",
    conversationId = "synthetic-chat",
  } = {}) {
    await act(async () => {
      root.render(
        <InteractiveTerminal
          active={active}
          autoStart={autoStart}
          onSendToChat={vi.fn()}
          workspacePath={workspace}
          origin={{
            botId,
            originConversationId: conversationId,
            workspacePath: workspace,
          }}
        />,
      );
    });
  }

  function holdStart(workspaces = [workspacePath]) {
    const requests = workspaces.map((workspace, index) => {
      const session: InteractiveTerminalSession = {
        id: `synthetic-pending-session-${index}`,
        state: "running",
        shell: `synthetic-shell-${index}`,
        cwd: workspace,
        cols: 100,
        rows: 30,
        startedAt: "2026-10-04T00:00:00.000Z",
        pty: true,
        supportsResize: true,
        outputBytes: 0,
      };
      let resolveStart!: (result: InteractiveTerminalStartResult) => void;
      let rejectStart!: (error: Error) => void;
      const pending = new Promise<InteractiveTerminalStartResult>(
        (resolve, reject) => {
          resolveStart = resolve;
          rejectStart = reject;
        },
      );
      return { pending, rejectStart, resolveStart, session };
    });
    let nextRequest = 0;
    const start = vi.fn(
      (_request: { requestId: string }) => requests[nextRequest++].pending,
    );
    const output = vi.fn(
      async (
        sessionId: string,
        _cursor: number,
      ): Promise<
        Awaited<
          ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>
        >
      > => {
        const request = requests.find(
          ({ session }) => session.id === sessionId,
        );
        if (!request) throw new Error("Unexpected synthetic terminal session");
        return {
          status: "available" as const,
          output: {
            session: request.session,
            chunks: [],
            nextCursor: 0,
            truncatedBeforeCursor: false,
          },
        };
      },
    );
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: start,
      getInteractiveTerminalOutput: output,
    });
    return {
      output,
      start,
      session: requests[0].session,
      async complete(index = 0) {
        const { pending, resolveStart, session } = requests[index];
        await act(async () => {
          resolveStart({ status: "started", session });
          await pending;
        });
        flushFrames();
      },
      async fail(index = 0) {
        const { pending, rejectStart } = requests[index];
        await act(async () => {
          rejectStart(new Error(`Synthetic startup failure ${index}`));
          await pending.catch(() => undefined);
        });
        flushFrames();
      },
      async unconfirmed(index = 0) {
        const { pending, resolveStart } = requests[index];
        const requestId = start.mock.calls[index]?.[0]?.requestId;
        expect(requestId).toBeTruthy();
        await act(async () => {
          resolveStart({
            status: "unconfirmed",
            requestId,
            retryable: true,
            message: "Synthetic receipt unavailable",
          });
          await pending;
        });
        flushFrames();
      },
    };
  }

  function startShell(label = "Open shell") {
    const startButton = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    expect(startButton).not.toBeNull();
    act(() => {
      startButton?.focus();
      startButton?.click();
    });
    return startButton;
  }

  function flushFrames() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    });
  }

  function press(key: string) {
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
    });
  }

  beforeEach(async () => {
    localStorage.clear();
    typography.fontFamilies.length = 0;
    typography.focusCount = 0;
    typography.onData = null;
    typography.resize = null;
    typography.terminal = null;
    style = document.createElement("style");
    style.textContent =
      '[aria-label="Terminal output"] { font-family: "SFMono-Regular", "Liberation Mono", monospace; }';
    document.head.append(style);
    frames = new Map();
    let nextFrame = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = ++nextFrame;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          typography.resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    host = document.createElement("div");
    document.body.append(host);
    outsideButton = document.createElement("button");
    outsideButton.textContent = "Review filter";
    document.body.append(outsideButton);
    root = createRoot(host);
    await renderTerminal();
    flushFrames();
    expect(document.activeElement).toBe(host.querySelector("textarea"));
    const create = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Create terminal tab"]',
    );
    for (let index = 0; index < 3; index++) {
      act(() => create?.click());
      flushFrames();
    }
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    outsideButton.remove();
    style.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps a live session and cursor after a transport-reset poll, then clears the notice on recovery", async () => {
    const pending = holdStart();
    pending.output.mockResolvedValueOnce({
      status: "unconfirmed",
      sessionId: pending.session.id,
      retryable: true,
      message: "fetch failed: ECONNRESET",
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();

    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
    expect(host.textContent).toContain("Session preserved");
    expect(pending.output).toHaveBeenCalledWith(
      "synthetic-pending-session-0",
      0,
      "synthetic-bot",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(pending.output.mock.calls.length).toBeGreaterThan(1);
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
    expect(host.textContent).not.toContain("Session preserved");
  });

  it("ignores a delayed output success after changing workspace context", async () => {
    const pending = holdStart();
    let resolveOutput!: (
      value: Awaited<
        ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>
      >,
    ) => void;
    const heldOutput = new Promise<
      Awaited<ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>>
    >((resolve) => {
      resolveOutput = resolve;
    });
    pending.output.mockReturnValueOnce(heldOutput);
    vi.useFakeTimers();
    startShell();
    await pending.complete();
    await renderTerminal({ workspace: "/synthetic/other-workspace" });

    await act(async () => {
      resolveOutput({
        status: "available",
        output: {
          session: pending.session,
          chunks: [{ cursor: 20, data: "old workspace output" }],
          nextCursor: 20,
          truncatedBeforeCursor: false,
        },
      });
      await heldOutput;
    });
    expect(host.textContent).not.toContain("old workspace output");
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 1 (closed)");
  });

  it("does not revive a closed or restarted session from an earlier pending output success", async () => {
    const pending = holdStart([workspacePath, workspacePath]);
    let resolveOutput!: (
      value: Awaited<
        ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>
      >,
    ) => void;
    const heldOutput = new Promise<
      Awaited<ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>>
    >((resolve) => {
      resolveOutput = resolve;
    });
    pending.output.mockReturnValueOnce(heldOutput);
    const close = vi.fn(async () => ({
      ...pending.session,
      state: "closed" as const,
    }));
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      closeInteractiveTerminal: close,
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Stop terminal session"]',
        )
        ?.click();
      await Promise.resolve();
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (closed)");
    startShell();
    await pending.complete(1);
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");

    await act(async () => {
      resolveOutput({
        status: "available",
        output: {
          session: pending.session,
          chunks: [{ cursor: 16, data: "stale output" }],
          nextCursor: 16,
          truncatedBeforeCursor: false,
        },
      });
      await heldOutput;
    });
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
    expect(host.textContent).toContain("synthetic-shell-1");
    expect(host.textContent).not.toContain("stale output");
  });

  it("retrieves retained output once for a recovered shell that already exited", async () => {
    const pending = holdStart();
    pending.session.state = "exited";
    pending.session.exitCode = 0;
    pending.session.completedAt = "2026-10-04T00:00:01.000Z";
    pending.output.mockResolvedValueOnce({
      status: "available",
      output: {
        session: pending.session,
        chunks: [{ cursor: 14, data: "finished output" }],
        nextCursor: 14,
        truncatedBeforeCursor: false,
      },
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pending.output).toHaveBeenCalledWith(
      pending.session.id,
      0,
      "synthetic-bot",
    );
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (exited)");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(pending.output).toHaveBeenCalledTimes(1);
    const saved = loadInteractiveTerminalState(
      workspacePath,
      localStorage,
      JSON.stringify(["synthetic-bot", "synthetic-chat"]),
    );
    expect(
      saved.tabs.find((tab) => tab.name === "Terminal 4")?.output,
    ).toContain("finished output");
  });

  it("bounds uncertain exited-output reads and allows a manual same-session retry", async () => {
    const pending = holdStart();
    pending.session.state = "exited";
    pending.session.exitCode = 0;
    pending.output.mockResolvedValue({
      status: "unconfirmed",
      sessionId: pending.session.id,
      retryable: true,
      message: "Temporary output transport reset",
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(pending.output).toHaveBeenCalledTimes(4);
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Retry output",
    );
    expect(retry).toBeDefined();
    pending.output.mockResolvedValueOnce({
      status: "available",
      output: {
        session: pending.session,
        chunks: [{ cursor: 13, data: "late output" }],
        nextCursor: 13,
        truncatedBeforeCursor: false,
      },
    });
    act(() => retry?.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pending.output).toHaveBeenCalledTimes(5);
    expect(host.textContent).not.toContain("Session preserved");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(pending.output).toHaveBeenCalledTimes(5);
    const saved = loadInteractiveTerminalState(
      workspacePath,
      localStorage,
      JSON.stringify(["synthetic-bot", "synthetic-chat"]),
    );
    expect(
      saved.tabs.find((tab) => tab.name === "Terminal 4")?.output,
    ).toContain("late output");
  });

  it("rechecks uncertain exited output when its background tab is selected", async () => {
    const pending = holdStart();
    pending.session.state = "exited";
    pending.session.exitCode = 0;
    pending.output.mockResolvedValue({
      status: "unconfirmed",
      sessionId: pending.session.id,
      retryable: true,
      message: "Background output receipt unavailable",
    });
    vi.useFakeTimers();
    startShell();
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 3"))
        ?.click(),
    );
    await pending.complete();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pending.output).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain(
      "Background output receipt unavailable",
    );

    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 4"))
        ?.click(),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(pending.output).toHaveBeenCalledTimes(5);
    expect(host.textContent).toContain("Background output receipt unavailable");
    expect(
      [...host.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent === "Retry output",
      ),
    ).toBeDefined();
  });

  it.each(["available", "error"] as const)(
    "keeps tab B's warning when tab A's delayed %s arrives",
    async (outcome) => {
      const pending = holdStart([workspacePath, workspacePath]);
      let resolveOutput!: (
        value: Awaited<
          ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>
        >,
      ) => void;
      let rejectOutput!: (error: Error) => void;
      const heldOutput = new Promise<
        Awaited<
          ReturnType<typeof window.doolittle.getInteractiveTerminalOutput>
        >
      >((resolve, reject) => {
        resolveOutput = resolve;
        rejectOutput = reject;
      });
      pending.output.mockReturnValueOnce(heldOutput).mockResolvedValueOnce({
        status: "unconfirmed",
        sessionId: "synthetic-pending-session-1",
        retryable: false,
        message: "B access denied",
      });
      vi.useFakeTimers();
      startShell();
      await pending.complete(0);
      const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      act(() => tabs[2]?.click());
      startShell();
      await pending.complete(1);
      expect(host.querySelector('[role="status"]')?.textContent).toContain(
        "B access denied",
      );

      await act(async () => {
        if (outcome === "available") {
          resolveOutput({
            status: "available",
            output: {
              session: pending.session,
              chunks: [{ cursor: 15, data: "A retained output" }],
              nextCursor: 15,
              truncatedBeforeCursor: false,
            },
          });
        } else rejectOutput(new Error("A transport reset"));
        await heldOutput.catch(() => undefined);
      });
      expect(host.querySelector('[role="status"]')?.textContent).toContain(
        "B access denied",
      );
      expect(host.querySelector('[role="status"]')?.textContent).not.toContain(
        "A transport reset",
      );
      expect(
        host
          .querySelector('[role="tab"][aria-selected="true"]')
          ?.getAttribute("title"),
      ).toBe("Terminal 3 (running)");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(420);
      });
      const saved = loadInteractiveTerminalState(
        workspacePath,
        localStorage,
        JSON.stringify(["synthetic-bot", "synthetic-chat"]),
      );
      const a = saved.tabs.find((tab) => tab.name === "Terminal 4");
      expect(a?.output.includes("A retained output")).toBe(
        outcome === "available",
      );
    },
  );

  it("closes only on a matching, definitive absent receipt", async () => {
    const pending = holdStart();
    pending.output.mockResolvedValueOnce({
      status: "absent",
      sessionId: pending.session.id,
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();

    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (closed)");
    expect(host.textContent).toContain("no longer available");
    expect(pending.output).toHaveBeenCalledTimes(1);
  });

  it("does not retry a denied or unclassified output receipt", async () => {
    const pending = holdStart();
    pending.output.mockResolvedValueOnce({
      status: "unconfirmed",
      sessionId: pending.session.id,
      retryable: false,
      message: "Access denied",
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(pending.output).toHaveBeenCalledTimes(1);
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
    expect(host.textContent).toContain("Session preserved. Access denied");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Retry output",
    );
    expect(retry).not.toBeNull();
    expect(retry?.isConnected).toBe(true);
    expect(retry?.disabled).toBe(false);
    act(() => retry?.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(pending.output.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(host.textContent).not.toContain("Session preserved");
  });

  it("reuses one persisted creation ID for a manual retry after an unconfirmed start", async () => {
    const session: InteractiveTerminalSession = {
      id: "synthetic-reconciled-session",
      state: "running",
      shell: "shell",
      cwd: workspacePath,
      cols: 100,
      rows: 30,
      startedAt: "2026-10-04T00:00:00.000Z",
      pty: true,
      supportsResize: true,
      outputBytes: 0,
    };
    const start = vi.fn(async (request: { requestId: string }) =>
      start.mock.calls.length === 1
        ? {
            status: "unconfirmed" as const,
            requestId: request.requestId,
            retryable: true,
            message: "Connection reset",
          }
        : { status: "started" as const, session },
    );
    const output = vi.fn(async () => ({
      status: "available" as const,
      output: {
        session,
        chunks: [],
        nextCursor: 0,
        truncatedBeforeCursor: false,
      },
    }));
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: start,
      getInteractiveTerminalOutput: output,
    });
    vi.useFakeTimers();
    startShell();
    await act(async () => {
      await Promise.resolve();
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[0]).not.toHaveProperty("reconcileOnly");
    expect(host.textContent).toContain("creation could not be confirmed");
    const firstId = start.mock.calls[0]?.[0].requestId;
    expect(firstId).toMatch(
      /^\d{13}\.[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
    );
    const saved = loadInteractiveTerminalState(
      workspacePath,
      localStorage,
      JSON.stringify(["synthetic-bot", "synthetic-chat"]),
    );
    expect(
      saved.tabs.find((tab) => tab.name === "Terminal 4")?.pendingStart
        ?.requestId,
    ).toBe(firstId);

    startShell("Retry shell request");
    await act(async () => {
      await Promise.resolve();
    });
    expect(start).toHaveBeenCalledTimes(2);
    expect(start.mock.calls[1]?.[0].requestId).toBe(firstId);
    expect(start.mock.calls[1]?.[0]).toHaveProperty("reconcileOnly", true);
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
  });

  it("isolates a pending shell request when the owner changes in the same workspace", async () => {
    const pending = holdStart();
    startShell();
    const prior = loadInteractiveTerminalState(
      workspacePath,
      localStorage,
      JSON.stringify(["synthetic-bot", "synthetic-chat"]),
    );
    expect(
      prior.tabs.find((tab) => tab.name === "Terminal 4")?.pendingStart,
    ).not.toBeNull();

    await renderTerminal({ botId: "other-bot", conversationId: "other-chat" });
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("synthetic-shell-0");
    expect(host.textContent).not.toContain("Checking previous shell request");
    await pending.complete();
    expect(pending.output).not.toHaveBeenCalled();
    expect(host.querySelector('[role="tab"]')?.getAttribute("title")).toBe(
      "Terminal 1 (closed)",
    );
    const savedPrior = loadInteractiveTerminalState(
      workspacePath,
      localStorage,
      JSON.stringify(["synthetic-bot", "synthetic-chat"]),
    );
    expect(
      savedPrior.tabs.find((tab) => tab.name === "Terminal 4")?.pendingStart,
    ).not.toBeNull();
  });

  it("cancels tab-only abandonment without losing an unresolved shell request", async () => {
    const pending = holdStart();
    const nativeClose = vi.fn();
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      closeInteractiveTerminal: nativeClose,
    });
    startShell();
    const close = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Close terminal Terminal 4"]',
    );
    expect(close).not.toBeNull();
    act(() => close?.click());
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(host.textContent).toContain("The shell may still be running");
    const cancel = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Cancel",
    );
    expect(cancel).toBeDefined();
    act(() => cancel?.click());
    expect(host.textContent).not.toContain("Discard tab only");
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(nativeClose).not.toHaveBeenCalled();

    await pending.complete();
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
  });

  it("confirms discarding only the tab and never sends a native close", async () => {
    const pending = holdStart();
    const nativeClose = vi.fn();
    const nativeInput = vi.fn();
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      closeInteractiveTerminal: nativeClose,
      writeInteractiveTerminal: nativeInput,
    });
    startShell();
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Close terminal Terminal 4"]',
        )
        ?.click(),
    );
    const confirm = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Discard tab only");
    expect(confirm).toBeDefined();
    act(() => confirm?.click());
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(host.textContent).toContain(
      "Discarded tab only. The shell may still be running",
    );
    expect(host.textContent).not.toContain("Closed terminal Terminal 4");
    expect(nativeClose).not.toHaveBeenCalled();
    expect(nativeInput).not.toHaveBeenCalled();
    expect(pending.start).toHaveBeenCalledTimes(1);
    await pending.complete();
    expect(host.textContent).not.toContain("synthetic-shell-0");
    expect(pending.output).not.toHaveBeenCalled();
  });

  it("discarding another pending tab does not invalidate the active tab's in-flight start", async () => {
    const pending = holdStart([workspacePath, workspacePath]);
    startShell();
    await pending.unconfirmed();
    expect(host.textContent).toContain("Synthetic receipt unavailable");

    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 3"))
        ?.click(),
    );
    startShell();
    expect(pending.start).toHaveBeenCalledTimes(2);
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 4"))
        ?.click(),
    );
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Close terminal Terminal 4"]',
        )
        ?.click(),
    );
    const confirm = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Discard tab only");
    expect(confirm).toBeDefined();
    act(() => confirm?.click());
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(3);

    await pending.complete(1);
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 3"))
        ?.click(),
    );
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 3 (running)");
    expect(pending.output).toHaveBeenCalledWith(
      "synthetic-pending-session-1",
      0,
      "synthetic-bot",
    );
  });

  it.each(["complete", "unconfirmed"] as const)(
    "keeps B's pending warning when A's deferred start is %s",
    async (outcome) => {
      const pending = holdStart([workspacePath, workspacePath]);
      act(() =>
        [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
          .find((tab) => tab.textContent?.includes("Terminal 3"))
          ?.click(),
      );
      startShell();
      await pending.unconfirmed(0);
      act(() =>
        [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
          .find((tab) => tab.textContent?.includes("Terminal 4"))
          ?.click(),
      );
      startShell();
      act(() =>
        [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
          .find((tab) => tab.textContent?.includes("Terminal 3"))
          ?.click(),
      );
      expect(host.textContent).toContain(PENDING_WARNING_TEXT);
      await pending[outcome](1);
      expect(host.textContent).toContain(PENDING_WARNING_TEXT);
      expect(
        host
          .querySelector('[role="tab"][aria-selected="true"]')
          ?.getAttribute("title"),
      ).toBe("Terminal 3 (closed)");
    },
  );

  it("ignores an old discard confirmation after same-workspace owner and tab-ID reuse", async () => {
    const pending = holdStart();
    const nativeClose = vi.fn();
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      closeInteractiveTerminal: nativeClose,
    });
    startShell();
    const selectedId = host.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    )?.id;
    expect(selectedId).toBeTruthy();
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Close terminal Terminal 4"]',
        )
        ?.click(),
    );
    const oldConfirm = [
      ...host.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Discard tab only");
    expect(oldConfirm).toBeDefined();

    const reused = createInteractiveTerminalTab("Other owner shell");
    reused.id =
      selectedId
        ?.replace(/-tab$/u, "")
        ?.replace(/^interactive-terminal-/u, "") ?? "";
    reused.pendingStart = {
      requestId: "1234567890123.00000000-0000-4000-8000-000000000000",
      cols: 100,
      rows: 30,
    };
    saveInteractiveTerminalState(
      workspacePath,
      { activeTabId: reused.id, tabs: [reused] },
      localStorage,
      JSON.stringify(["other-bot", "other-chat"]),
    );
    await renderTerminal({ botId: "other-bot", conversationId: "other-chat" });
    expect(host.textContent).not.toContain("Discard tab only");
    act(() => oldConfirm?.click());
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(host.textContent).toContain("Other owner shell");
    expect(host.textContent).not.toContain("Discarded tab only");
    expect(nativeClose).not.toHaveBeenCalled();
    expect(
      loadInteractiveTerminalState(
        workspacePath,
        localStorage,
        JSON.stringify(["other-bot", "other-chat"]),
      ).tabs[0]?.pendingStart?.requestId,
    ).toBe(reused.pendingStart.requestId);
  });

  it("does not let a delayed close remove a tab after its owner changes", async () => {
    const pending = holdStart();
    startShell();
    await pending.complete();
    let resolveClose!: (session: InteractiveTerminalSession) => void;
    const closing = new Promise<InteractiveTerminalSession>((resolve) => {
      resolveClose = resolve;
    });
    const nativeClose = vi.fn(() => closing);
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      closeInteractiveTerminal: nativeClose,
    });
    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Close terminal Terminal 4"]',
        )
        ?.click(),
    );
    expect(nativeClose).toHaveBeenCalledOnce();
    await renderTerminal({ botId: "other-bot", conversationId: "other-chat" });
    await act(async () => {
      resolveClose({ ...pending.session, state: "closed" });
      await closing;
    });
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(host.textContent).not.toContain("Closed terminal Terminal 4");

    await renderTerminal();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(
      [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 4"))
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (running)");
  });

  it("keeps B's warning when A's delayed input and resize fail", async () => {
    const pending = holdStart([workspacePath, workspacePath]);
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 3"))
        ?.click(),
    );
    startShell();
    await pending.unconfirmed(0);
    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 4"))
        ?.click(),
    );
    startShell();
    await pending.complete(1);

    let rejectWrite!: (error: Error) => void;
    let rejectResize!: (error: Error) => void;
    const writing = new Promise<void>((_resolve, reject) => {
      rejectWrite = reject;
    });
    const resizing = new Promise<InteractiveTerminalSession>(
      (_resolve, reject) => {
        rejectResize = reject;
      },
    );
    const write = vi.fn((_request: { data: string }) => writing);
    const resize = vi.fn(() => resizing);
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      writeInteractiveTerminal: write,
      resizeInteractiveTerminal: resize,
    });
    vi.useFakeTimers();
    await act(async () => {
      typography.onData?.("synthetic input");
      await Promise.resolve();
    });
    expect(write).toHaveBeenCalledOnce();
    if (typography.terminal) typography.terminal.cols = 120;
    act(() =>
      typography.resize?.([{} as ResizeObserverEntry], {} as ResizeObserver),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(29);
    });
    expect(resize).toHaveBeenCalledOnce();

    act(() =>
      [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((tab) => tab.textContent?.includes("Terminal 3"))
        ?.click(),
    );
    expect(host.textContent).toContain(PENDING_WARNING_TEXT);
    await act(async () => {
      rejectWrite(new Error("stale write failure"));
      rejectResize(new Error("stale resize failure"));
      await Promise.allSettled([writing, resizing]);
    });
    expect(host.textContent).toContain(PENDING_WARNING_TEXT);
    expect(host.textContent).not.toContain("stale write failure");
    expect(host.textContent).not.toContain("stale resize failure");
  });

  it("does not dispatch queued terminal input after the owner changes", async () => {
    const pending = holdStart();
    startShell();
    await pending.complete();
    let resolveWrite!: () => void;
    const writing = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const write = vi.fn((_request: { data: string }) => writing);
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: pending.start,
      getInteractiveTerminalOutput: pending.output,
      writeInteractiveTerminal: write,
    });
    await act(async () => {
      typography.onData?.("first input");
      typography.onData?.("queued input");
      await Promise.resolve();
    });
    expect(write).toHaveBeenCalledOnce();

    await renderTerminal({ botId: "other-bot", conversationId: "other-chat" });
    await act(async () => {
      resolveWrite();
      await writing;
      await Promise.resolve();
    });
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.[0].data).toBe("first input");
  });

  it("shows and reconciles a saved unknown creation request after remount", async () => {
    const pending = holdStart();
    startShell();
    const saved = loadInteractiveTerminalState(
      workspacePath,
      localStorage,
      JSON.stringify(["synthetic-bot", "synthetic-chat"]),
    );
    const requestId = saved.tabs.find((tab) => tab.name === "Terminal 4")
      ?.pendingStart?.requestId;
    expect(requestId).toBeTruthy();
    await act(async () => root.unmount());
    root = createRoot(host);
    await renderTerminal();
    expect(host.textContent).toContain("Shell creation is unconfirmed");
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Retry shell request"]',
      ),
    ).not.toBeNull();
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(4);
    // The old IPC response cannot claim this new component instance.
    await pending.complete();
    expect(
      host
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("title"),
    ).toBe("Terminal 4 (closed)");
    expect(
      loadInteractiveTerminalState(
        workspacePath,
        localStorage,
        JSON.stringify(["synthetic-bot", "synthetic-chat"]),
      ).tabs.find((tab) => tab.name === "Terminal 4")?.pendingStart?.requestId,
    ).toBe(requestId);
    const retry = vi.fn(async (request: { requestId: string }) => ({
      status: "unconfirmed" as const,
      requestId: request.requestId,
      retryable: false,
      message: "Still unconfirmed",
    }));
    vi.stubGlobal("doolittle", { startInteractiveTerminal: retry });
    startShell("Retry shell request");
    await act(async () => {
      await Promise.resolve();
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0]?.[0].requestId).toBe(requestId);
    expect(retry.mock.calls[0]?.[0]).toHaveProperty("reconcileOnly", true);
  });

  it("stops automatic output reconciliation at the retry bound and allows a manual read-only retry", async () => {
    const pending = holdStart();
    pending.output.mockResolvedValue({
      status: "unconfirmed",
      sessionId: pending.session.id,
      retryable: true,
      message: "Temporary transport reset",
    });
    vi.useFakeTimers();
    startShell();
    await pending.complete();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(pending.output).toHaveBeenCalledTimes(4);
    expect(host.textContent).toContain("Session preserved");
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Retry output",
    );
    expect(retry).not.toBeNull();
    expect(retry?.isConnected).toBe(true);
    expect(retry?.disabled).toBe(false);
    act(() => retry?.click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(pending.output).toHaveBeenCalledTimes(5);
    expect(
      pending.output.mock.calls.every(
        ([id, cursor]) => id === pending.session.id && cursor === 0,
      ),
    ).toBe(true);
  });

  it("passes the resolved viewport mono stack to canvas rendering, with a literal fallback", () => {
    const viewport = host.querySelector<HTMLElement>(
      '[aria-label="Terminal output"]',
    );
    expect(viewport).not.toBeNull();
    const resolved = getComputedStyle(viewport as HTMLElement).fontFamily;
    expect(resolved).toContain("SFMono-Regular");
    expect(typography.fontFamilies.every((value) => value === resolved)).toBe(
      true,
    );
    expect(
      typography.fontFamilies.some((value) => value.includes("var(")),
    ).toBe(false);
    const computedStyle = getComputedStyle;
    vi.stubGlobal("getComputedStyle", (element: Element) =>
      element === viewport
        ? ({ fontFamily: "" } as CSSStyleDeclaration)
        : computedStyle(element),
    );
    host.querySelector<HTMLButtonElement>('[role="tab"]')?.focus();
    press("Home");
    expect(typography.fontFamilies.at(-1)).toBe("monospace");
  });

  it("keeps Home focus on the tab before a continuous ArrowRight, including deferred xterm fitting", () => {
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0].focus();
    press("Home");
    flushFrames();
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[0]);
    press("ArrowRight");
    flushFrames();
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].tabIndex).toBe(0);
    expect(document.activeElement).toBe(tabs[1]);
  });

  it("routes successive keys through the newly selected tab without waiting for animation frames", () => {
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0].focus();
    press("Home");
    press("ArrowRight");
    press("ArrowRight");
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs[2]);
    flushFrames();
    expect(document.activeElement).toBe(tabs[2]);
  });

  it("does not take focus back from Review when a pending start completes", async () => {
    const pending = holdStart();
    startShell();
    expect(pending.start).toHaveBeenCalledOnce();
    outsideButton.focus();

    await pending.complete();

    expect(document.activeElement).toBe(outsideButton);
  });

  it("does not focus another terminal when the starting tab is no longer selected", async () => {
    const pending = holdStart();
    startShell();
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0].focus();
    press("Home");
    flushFrames();
    expect(document.activeElement).toBe(tabs[0]);

    await pending.complete();

    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  });

  it("preserves a different toolbar control within the same terminal", async () => {
    const pending = holdStart();
    startShell();
    const rename = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Rename terminal Terminal 4"]',
    );
    expect(rename).not.toBeNull();
    rename?.focus();

    await pending.complete();

    expect(document.activeElement).toBe(rename);
  });

  it("does not claim unchanged external focus when auto-start begins there", async () => {
    const pending = holdStart();
    outsideButton.focus();
    await renderTerminal({ autoStart: true });
    expect(pending.start).toHaveBeenCalledOnce();

    await pending.complete();

    expect(document.activeElement).toBe(outsideButton);
  });

  it.each(["inactive", "inert", "hidden", "workspace"])(
    "does not focus a terminal after its %s context changes",
    async (context) => {
      const pending = holdStart();
      startShell();
      if (context === "inactive") await renderTerminal({ active: false });
      else if (context === "workspace") {
        await renderTerminal({ workspace: "/synthetic/other-workspace" });
      } else host.setAttribute(context, "");
      const priorFocusCount = typography.focusCount;

      await pending.complete();

      expect(typography.focusCount).toBe(priorFocusCount);
    },
  );

  it("keeps explicit shell-start focus on the still-current terminal", async () => {
    const pending = holdStart();
    startShell();

    await pending.complete();

    expect(document.activeElement).toBe(host.querySelector("textarea"));
  });

  it("keeps explicit start focus when its disabled button blurs to body", async () => {
    const pending = holdStart();
    const startButton = startShell();
    expect(startButton?.disabled).toBe(true);
    // jsdom retains focus on disabled controls; model the native body fallback.
    document.body.tabIndex = -1;
    document.body.focus();
    document.body.removeAttribute("tabindex");
    expect(document.activeElement).toBe(document.body);

    await pending.complete();

    expect(document.activeElement).toBe(host.querySelector("textarea"));
  });

  it("keeps explicit activation focus while auto-start is pending", async () => {
    const pending = holdStart();
    await renderTerminal({ active: false });
    outsideButton.focus();
    await renderTerminal({ active: true, autoStart: true });
    flushFrames();
    const input = host.querySelector("textarea");
    expect(document.activeElement).toBe(input);
    expect(pending.start).toHaveBeenCalledOnce();

    await pending.complete();

    expect(document.activeElement).toBe(input);
  });

  it.each(["complete", "fail"] as const)(
    "does not let an older workspace start %s alter a same-ID pending tab",
    async (outcome) => {
      const otherWorkspace = "/synthetic/other-workspace";
      const pending = holdStart([workspacePath, otherWorkspace]);
      const selected = host.querySelector<HTMLButtonElement>(
        '[role="tab"][aria-selected="true"]',
      );
      const panelId = selected?.getAttribute("aria-controls") ?? "";
      const tab = createInteractiveTerminalTab("Same-ID restored terminal");
      tab.id = panelId.slice("interactive-terminal-".length, -"-panel".length);
      tab.cwd = otherWorkspace;
      saveInteractiveTerminalState(
        otherWorkspace,
        { activeTabId: tab.id, tabs: [tab] },
        localStorage,
        JSON.stringify(["synthetic-bot", "synthetic-chat"]),
      );
      startShell();
      await renderTerminal({ workspace: otherWorkspace });
      startShell();
      expect(pending.start).toHaveBeenCalledTimes(2);

      await pending[outcome](0);

      expect(host.querySelector('[role="status"]')?.textContent).toBe(
        "Opening workspace shell…",
      );
      const currentStart = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Opening shell"]',
      );
      expect(currentStart?.disabled).toBe(true);
      expect(host.querySelector('[role="tab"]')?.getAttribute("title")).toBe(
        "Same-ID restored terminal (closed)",
      );
      expect(pending.output).not.toHaveBeenCalled();
      expect(host.textContent).not.toContain("Synthetic startup failure 0");

      await pending.complete(1);

      expect(host.querySelector('[role="tab"]')?.getAttribute("title")).toBe(
        "Same-ID restored terminal (running)",
      );
      expect(host.textContent).toContain("synthetic-shell-1");
      expect(host.textContent).not.toContain("synthetic-shell-0");
      expect(host.querySelector('[role="status"]')).toBeNull();
      expect(
        host.querySelector('button[aria-label="Stop terminal session"]'),
      ).not.toBeNull();
      expect(pending.output).toHaveBeenCalledWith(
        "synthetic-pending-session-1",
        0,
        "synthetic-bot",
      );
    },
  );

  it("invalidates startup ownership after leaving and returning to its workspace", async () => {
    const pending = holdStart();
    const originalTabId = host
      .querySelector('[role="tab"][aria-selected="true"]')
      ?.getAttribute("id");
    startShell();
    await renderTerminal({ workspace: "/synthetic/other-workspace" });
    await renderTerminal();
    const restored = host.querySelector('[role="tab"][aria-selected="true"]');
    expect(restored?.getAttribute("id")).toBe(originalTabId);

    await pending.complete();

    expect(restored?.getAttribute("title")).toBe("Terminal 4 (closed)");
    expect(host.textContent).not.toContain("synthetic-shell-0");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Shell creation is unconfirmed",
    );
    expect(pending.output).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[aria-label="Retry shell request"]',
      )?.disabled,
    ).toBe(false);
  });
});
