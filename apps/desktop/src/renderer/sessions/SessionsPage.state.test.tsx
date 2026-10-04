// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopRequestMock, useApiResourceMock } = vi.hoisted(() => ({
  desktopRequestMock: vi.fn(),
  useApiResourceMock: vi.fn(),
}));
vi.mock("../lib", async () => ({
  ...(await vi.importActual<typeof import("../lib")>("../lib")),
  desktopRequest: desktopRequestMock,
  useApiResource: useApiResourceMock,
}));

import { SessionsPage } from "./SessionsPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const sessions = [
  {
    sessionId: "first",
    title: "First conversation",
    messageCount: 0,
    participants: [],
    preview: [],
  },
  {
    sessionId: "second",
    title: "Second conversation",
    messageCount: 0,
    participants: [],
    preview: [],
  },
];

describe("History workspace actions", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    desktopRequestMock.mockReset();
    useApiResourceMock.mockReturnValue({
      data: { messages: [] },
      loading: false,
      error: "",
      reload: vi.fn(),
    });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  const button = (text: string) =>
    [...container.querySelectorAll("button")].find(
      (entry) => entry.textContent === text,
    );

  it("locks duplicate rename writes and resets editing when another conversation is selected", async () => {
    let resolveRename: (() => void) | undefined;
    desktopRequestMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRename = resolve;
        }),
    );
    const refresh = vi.fn();
    const openChat = vi.fn();
    act(() =>
      root.render(
        <SessionsPage
          active
          embedded
          sessions={sessions}
          refresh={refresh}
          openChat={openChat}
          onNewConversation={vi.fn()}
        />,
      ),
    );
    act(() => button("Rename")?.click());
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Session title"]',
    );
    expect(document.activeElement).toBe(input);
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "Renamed first");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = input?.closest("form");
    act(() => {
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(desktopRequestMock).toHaveBeenCalledOnce();
    expect(desktopRequestMock).toHaveBeenCalledWith("/sessions/title", "POST", {
      sessionId: "first",
      title: "Renamed first",
    });
    expect(button("Saving…")?.disabled).toBe(true);
    const second = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-session-row="true"]',
      ),
    ].find((entry) => entry.textContent?.includes("Second conversation"));
    act(() => second?.click());
    expect(
      container.querySelector('input[aria-label="Session title"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-session-detail="true"] h2')?.textContent,
    ).toBe("Second conversation");
    await act(async () => {
      resolveRename?.();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(
      container.querySelector('input[aria-label="Session title"]'),
    ).toBeNull();
    act(() => button("Open in workspace")?.click());
    expect(openChat).toHaveBeenCalledWith("second");
  });

  it("keeps an invalid blank rename disabled and lets Escape-free cancel restore the transcript", () => {
    act(() =>
      root.render(
        <SessionsPage
          active
          sessions={sessions}
          refresh={vi.fn()}
          openChat={vi.fn()}
          onNewConversation={vi.fn()}
        />,
      ),
    );
    act(() => button("Rename")?.click());
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Session title"]',
    );
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "  ");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(button("Save")?.disabled).toBe(true);
    act(() => button("Cancel")?.click());
    expect(
      container.querySelector('input[aria-label="Session title"]'),
    ).toBeNull();
    expect(desktopRequestMock).not.toHaveBeenCalled();
  });
});
