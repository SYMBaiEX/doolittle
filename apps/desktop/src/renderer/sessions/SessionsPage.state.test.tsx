// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { desktopRequestMock, useApiResourceMock, copyContextTextMock } =
  vi.hoisted(() => ({
    desktopRequestMock: vi.fn(),
    useApiResourceMock: vi.fn(),
    copyContextTextMock: vi.fn(async () => undefined),
  }));
vi.mock("../lib", async () => ({
  ...(await vi.importActual<typeof import("../lib")>("../lib")),
  desktopRequest: desktopRequestMock,
  useApiResource: useApiResourceMock,
}));
vi.mock("../context-menu-clipboard", () => ({
  copyContextText: copyContextTextMock,
}));

import { SessionDetail, SessionTranscriptMessage } from "./SessionDetail";
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
    copyContextTextMock.mockClear();
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

  it("opens a history row's own conversation without changing the currently previewed transcript", async () => {
    const openChat = vi.fn();
    act(() =>
      root.render(
        <SessionsPage
          active
          sessions={sessions}
          refresh={vi.fn()}
          openChat={openChat}
          onNewConversation={vi.fn()}
        />,
      ),
    );
    const second = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-session-row="true"]',
      ),
    ].find((entry) => entry.textContent?.includes("Second conversation"));
    await act(async () =>
      second?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
    );
    const open = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Open in workspace");
    act(() => open?.click());
    expect(openChat).toHaveBeenCalledWith("second");
    expect(
      container.querySelector('[data-session-detail="true"] h2')?.textContent,
    ).toBe("First conversation");
    expect(desktopRequestMock).not.toHaveBeenCalled();
  });

  it("uses the same rename form from the detail context menu and preserves target identity", async () => {
    desktopRequestMock.mockResolvedValue(undefined);
    const refresh = vi.fn();
    act(() =>
      root.render(
        <SessionsPage
          active
          sessions={sessions}
          refresh={refresh}
          openChat={vi.fn()}
          onNewConversation={vi.fn()}
        />,
      ),
    );
    const second = [
      ...container.querySelectorAll<HTMLButtonElement>(
        '[data-session-row="true"]',
      ),
    ].find((entry) => entry.textContent?.includes("Second conversation"));
    act(() => second?.click());
    const title = container.querySelector<HTMLElement>(
      '[data-session-detail="true"] h2',
    );
    await act(async () =>
      title?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
    );
    const rename = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Rename conversation…");
    act(() => rename?.click());
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Session title"]',
    );
    expect(input?.value).toBe("Second conversation");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "Renamed second");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      input
        ?.closest("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
    );
    expect(desktopRequestMock).toHaveBeenCalledWith("/sessions/title", "POST", {
      sessionId: "second",
      title: "Renamed second",
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps detail context actions behind the same offline and transfer guards", async () => {
    const onExport = vi.fn();
    const onOpenChat = vi.fn();
    act(() =>
      root.render(
        <SessionDetail
          active={false}
          transferring
          onExport={onExport}
          onOpenChat={onOpenChat}
          onRefresh={vi.fn()}
          onSelectSession={vi.fn()}
          selected={sessions[0]}
        />,
      ),
    );
    const title = container.querySelector<HTMLElement>(
      '[data-session-detail="true"] h2',
    );
    await act(async () =>
      title?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
    );
    for (const label of [
      "Open in workspace",
      "Rename conversation…",
      "Export conversation",
    ]) {
      const action = [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ].find((item) => item.textContent === label);
      expect(action?.getAttribute("aria-disabled")).toBe("true");
      act(() => action?.click());
    }
    expect(onExport).not.toHaveBeenCalled();
    expect(onOpenChat).not.toHaveBeenCalled();
    expect(
      container.querySelector('input[aria-label="Session title"]'),
    ).toBeNull();
    expect(desktopRequestMock).not.toHaveBeenCalled();
  });

  it("offers saved-message copy actions from a keyboard-reachable overflow control", async () => {
    act(() =>
      root.render(
        <SessionTranscriptMessage
          message={{
            id: "saved-message",
            sessionId: "second",
            roomId: "room",
            entityId: "agent",
            role: "assistant",
            text: "A saved reply",
            createdAt: "2026-10-05T00:00:00.000Z",
          }}
        />,
      ),
    );
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Saved message actions"]',
    );
    expect(trigger?.tabIndex).toBe(0);
    trigger?.focus();
    await act(async () =>
      trigger?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    const copy = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Copy message");
    await act(async () => copy?.click());
    expect(copyContextTextMock).toHaveBeenCalledWith("A saved reply");
    expect(desktopRequestMock).not.toHaveBeenCalled();
  });
});
