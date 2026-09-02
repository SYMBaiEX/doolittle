// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/InteractiveTerminal", () => ({
  InteractiveTerminal: () => <div>Terminal</div>,
}));

import { ChatTerminalPanel } from "./ChatTerminalPanel";

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
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
      writable: true,
    });
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
