// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InteractiveTerminal } from "./InteractiveTerminal";

const typography = vi.hoisted(() => ({ fontFamilies: [] as string[] }));

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
    root = createRoot(host);
    await act(async () => {
      root.render(
        <InteractiveTerminal
          active
          onSendToChat={vi.fn()}
          workspacePath="/synthetic/keyboard-workspace"
        />,
      );
    });
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
});
