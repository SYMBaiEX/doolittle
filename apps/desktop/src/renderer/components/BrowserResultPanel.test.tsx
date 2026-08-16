// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserResult } from "../browser-result-model";
import { BrowserResultPanel } from "./BrowserResultPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const result: BrowserResult = {
  action: "capture",
  title: "Captured homepage",
  payload: {
    capture: {
      page: { title: "Homepage", url: "http://localhost:3000" },
      status: { captureReady: true },
    },
  },
};

describe("BrowserResultPanel thread handoff", () => {
  let container: HTMLDivElement;
  let root: Root;

  const sendButton = () =>
    [...container.querySelectorAll("button")].find(
      (button) =>
        button.textContent === "Send to thread" ||
        button.textContent === "Sending…",
    );

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function render(
    onSendToChat: (text: string) => boolean | Promise<boolean>,
    onError = vi.fn(),
  ) {
    await act(async () => {
      root.render(
        <BrowserResultPanel
          address="http://localhost:3000"
          currentUrl="http://localhost:3000"
          onError={onError}
          onSendToChat={onSendToChat}
          previewSize="Desktop"
          result={result}
        />,
      );
    });
    return onError;
  }

  it("stays ready when the handoff is declined", async () => {
    const send = vi.fn(async () => false);
    const onError = await render(send);

    await act(async () => {
      sendButton()?.click();
    });

    expect(send).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Ready to hand off");
    expect(container.textContent).not.toContain("Sent to the active thread.");
  });

  it("shows success only after an accepted handoff", async () => {
    const send = vi.fn(async () => true);
    await render(send);

    await act(async () => {
      sendButton()?.click();
    });

    expect(send).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Sent to the active thread.");
  });

  it("reports a rejected handoff and remains ready to retry", async () => {
    const send = vi.fn(async () => {
      throw new Error("Thread handoff failed");
    });
    const onError = await render(send);

    await act(async () => {
      sendButton()?.click();
    });

    expect(onError).toHaveBeenCalledWith("Thread handoff failed");
    expect(container.textContent).toContain("Ready to hand off");
  });

  it("prevents duplicate sends while the handoff is pending", async () => {
    let resolveSend: ((sent: boolean) => void) | undefined;
    const send = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSend = resolve;
        }),
    );
    await render(send);

    await act(async () => {
      sendButton()?.click();
      sendButton()?.click();
    });

    expect(send).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Sending to the active thread…");
    expect(sendButton()?.disabled).toBe(true);

    await act(async () => {
      resolveSend?.(true);
    });

    expect(container.textContent).toContain("Sent to the active thread.");
  });

  it("does not mark edited evidence as sent when an older handoff resolves", async () => {
    let resolveSend: ((sent: boolean) => void) | undefined;
    await render(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSend = resolve;
        }),
    );

    await act(async () => {
      sendButton()?.click();
    });
    const note = container.querySelector("textarea");
    expect(note).not.toBeNull();
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setValue?.call(note, "Verify the updated receipt");
      note?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      resolveSend?.(true);
    });

    expect(container.textContent).toContain("Ready to hand off");
    expect(container.textContent).not.toContain("Sent to the active thread.");
  });
});
