// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/InteractiveTerminal", () => ({
  InteractiveTerminal: ({ active }: { active: boolean }) => (
    <div data-interactive-terminal data-active={String(active)}>
      <textarea aria-label="Test PTY" defaultValue="retained output" />
    </div>
  ),
}));

import { ChatTerminalPanel, terminalHeightBounds } from "./ChatTerminalPanel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function ChatTerminalPanelFixture() {
  const [height, setHeight] = useState(560);

  return (
    <ChatTerminalPanel
      active
      height={height}
      open
      onClose={() => undefined}
      onResize={setHeight}
      onSendToChat={() => undefined}
      platform="darwin"
      workspacePath="/workspace"
    />
  );
}

describe("ChatTerminalPanel viewport height", () => {
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
      writable: true,
    });
  });

  it("fits the dock to the real chat budget without changing its preferred size", () => {
    expect(terminalHeightBounds(960, 240)).toEqual({
      default: 240,
      min: 180,
      max: 240,
    });
    expect(terminalHeightBounds(480, 0)).toEqual({
      default: 0,
      min: 0,
      max: 0,
    });
    expect(terminalHeightBounds(960)).toEqual({
      default: 280,
      min: 180,
      max: 556,
    });
  });

  it("discloses an undersized dock and retains its terminal through modal and resize", async () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 480,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const main = document.createElement("section");
    host.append(main);
    const resize = vi.fn();
    // The component is a direct flex sibling of the route in production.
    // Mount into that parent with a portal-free root to preserve that topology.
    const root = createRoot(main);
    const rect = (top: number, height: number) =>
      ({
        top,
        bottom: top + height,
        left: 0,
        right: 360,
        width: 360,
        height,
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.matches('[aria-label="Chat terminal panel"]'))
          return rect(0, Number.parseFloat(this.style.height) || 0);
        if (this.classList.contains("chat-conversation"))
          return rect(
            335.5 - (this.closest(".view-container")?.scrollTop ?? 0),
            284,
          );
        if (this.classList.contains("chat-composer")) return rect(0, 156);
        return rect(124, 0);
      },
    );
    const preferredHeight = 560;
    await act(async () => {
      root.render(
        <>
          <div
            className="view-container"
            data-view="chat"
            ref={(element) => {
              if (element)
                Object.defineProperty(element, "clientHeight", {
                  configurable: true,
                  get: () => {
                    const dock = main.querySelector<HTMLElement>(
                      '[aria-label="Chat terminal panel"]',
                    );
                    return (
                      window.innerHeight -
                      124 -
                      (Number.parseFloat(dock?.style.height ?? "0") || 0)
                    );
                  },
                });
            }}
          >
            <section data-session-panel="test">
              <div className="chat-conversation">
                <form className="chat-composer" />
              </div>
            </section>
          </div>
          <ChatTerminalPanel
            active
            height={preferredHeight}
            open
            onClose={() => undefined}
            onResize={resize}
            onSendToChat={() => undefined}
            platform="darwin"
            workspacePath="/workspace"
          />
        </>,
      );
    });
    const panel = main.querySelector<HTMLElement>(
      '[aria-label="Chat terminal panel"]',
    );
    const opener = main.querySelector<HTMLButtonElement>(
      '[aria-haspopup="dialog"]',
    );
    const pty = main.querySelector<HTMLTextAreaElement>(
      '[aria-label="Test PTY"]',
    );
    if (!panel || !opener || !pty) throw new Error("Missing terminal fixture");
    pty.value = "retained session";
    expect(panel.dataset.compact).toBe("true");
    expect(panel.style.height).toBe("45px");
    expect(pty.closest("[inert]")).not.toBeNull();
    expect(
      main.querySelector('[aria-label="Resize chat terminal"]'),
    ).toBeNull();

    await act(async () => opener.click());
    const dialog = main.querySelector<HTMLElement>('[role="dialog"]');
    if (!dialog) throw new Error("Missing terminal dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toContain("fixed inset-0");
    expect(main.querySelector('[aria-label="Test PTY"]')).toBe(pty);
    expect(pty.closest("[inert]")).toBeNull();
    expect(
      main.querySelector('[data-view="chat"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    });
    expect(main.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(pty.value).toBe("retained session");

    await act(async () => {
      window.innerHeight = 1000;
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.dataset.compact).toBe("false");
    expect(panel.style.height).toBe("380px");
    expect(main.querySelector('[aria-label="Test PTY"]')).toBe(pty);
    expect(resize).not.toHaveBeenCalled();
    await act(async () => {
      const route = main.querySelector<HTMLElement>('[data-view="chat"]');
      if (route) route.scrollTop = 120;
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.height).toBe("380px");
    await act(async () => {
      window.innerHeight = 1200;
      window.dispatchEvent(new Event("resize"));
    });
    expect(panel.style.height).toBe(`${preferredHeight}px`);
    expect(main.querySelector('[aria-label="Test PTY"]')).toBe(pty);
    expect(resize).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });

  it("clamps persisted terminal height to the short viewport range", () => {
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 640,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(<ChatTerminalPanelFixture />);
    });

    const panel = host.querySelector<HTMLElement>(
      '[aria-label="Chat terminal panel"]',
    );
    const resizeHandle = host.querySelector<HTMLHRElement>(
      '[aria-label="Resize chat terminal"]',
    );
    expect(panel?.style.height).toBe("307px");
    expect(resizeHandle?.getAttribute("aria-valuenow")).toBe("307");
    expect(resizeHandle?.getAttribute("aria-valuemax")).toBe("307");

    act(() => {
      resizeHandle?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }),
      );
    });
    expect(panel?.style.height).toBe("307px");
    expect(resizeHandle?.getAttribute("aria-valuenow")).toBe("307");

    act(() => {
      resizeHandle?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
      );
    });
    expect(panel?.style.height).toBe("291px");
    expect(resizeHandle?.getAttribute("aria-valuenow")).toBe("291");

    act(() => root.unmount());
    host.remove();
  });
});
