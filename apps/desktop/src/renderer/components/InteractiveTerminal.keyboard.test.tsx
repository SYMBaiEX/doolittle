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
  saveInteractiveTerminalState,
} from "./interactive-terminal-store";

const typography = vi.hoisted(() => ({
  fontFamilies: [] as string[],
  focusCount: 0,
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 100;
    rows = 30;
    options = {};
    input?: HTMLTextAreaElement;
    constructor(options: { fontFamily: string }) {
      typography.fontFamilies.push(options.fontFamily);
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
    onData() {
      return { dispose() {} };
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
  } = {}) {
    await act(async () => {
      root.render(
        <InteractiveTerminal
          active={active}
          autoStart={autoStart}
          onSendToChat={vi.fn()}
          workspacePath={workspace}
          origin={{
            botId: "synthetic-bot",
            originConversationId: "synthetic-chat",
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
    const start = vi.fn(() => requests[nextRequest++].pending);
    const output = vi.fn(async (sessionId: string) => {
      const request = requests.find(({ session }) => session.id === sessionId);
      if (!request) throw new Error("Unexpected synthetic terminal session");
      return {
        session: request.session,
        chunks: [],
        nextCursor: 0,
        truncatedBeforeCursor: false,
      };
    });
    vi.stubGlobal("doolittle", {
      startInteractiveTerminal: start,
      getInteractiveTerminalOutput: output,
    });
    return {
      output,
      start,
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
    };
  }

  function startShell() {
    const startButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open shell"]',
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
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(pending.output).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLButtonElement>('button[aria-label="Open shell"]')
        ?.disabled,
    ).toBe(false);
  });
});
