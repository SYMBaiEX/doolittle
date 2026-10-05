// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatHeaderChrome,
  type ChatHeaderChromeProps,
} from "./ChatHeaderChrome";

const handlers = {
  onOpenMobileConversations: vi.fn(),
  onOpenRouteControls: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onOpenSettings: vi.fn(),
  onPrepareCompression: vi.fn(),
  onSurfaceChange: vi.fn(),
  onToggleInspector: vi.fn(),
  onOpenInspectorTab: vi.fn(),
  onTogglePin: vi.fn(),
};

const baseProps: ChatHeaderChromeProps = {
  inspectorVisible: false,
  isNewConversation: true,
  mobileConversationsButtonRef: { current: null },
  mobileConversationsOpen: false,
  modelRouteLabel: "ollama · granite4.1:3b",
  ...handlers,
  selectedContextLabel: "0%",
  selectedContextPercent: 0,
  selectedContextTone: "neutral",
  selectedMessageCount: 0,
  sessionsCount: 3,
  surface: "conversation",
  workbenchToggleRef: { current: null },
  workspacePath: "/workspace",
};

describe("ChatHeaderChrome", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    for (const handler of Object.values(handlers)) handler.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (props: Partial<ChatHeaderChromeProps> = {}) => {
    act(() => root.render(<ChatHeaderChrome {...baseProps} {...props} />));
  };

  it("keeps a new draft quiet while retaining primary actions", () => {
    render();

    expect(container.textContent).not.toContain("Inspector");
    expect(
      container.querySelector('[aria-label="Open inspector"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Open settings"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Find conversation"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Conversation options"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("0 messages");
    expect(container.textContent).not.toContain("Not started");
    expect(container.textContent).not.toContain("0%");
    expect(
      container.querySelector('[aria-label="Pin conversation"]'),
    ).toBeNull();
  });

  it("leaves route hierarchy to the stable shell navigation", () => {
    render();

    expect(
      container.querySelector('nav[aria-label="Conversation breadcrumb"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Open full workspace");
  });

  it("leaves route controls in the composer and exposes one inspector toggle", () => {
    const modelRouteLabel =
      "Loading provider · Loading an unusually long model route";
    render({ modelRouteLabel });

    const route = container.querySelector<HTMLButtonElement>(
      '[aria-label^="Model options"]',
    );
    expect(route).toBeNull();
    expect(handlers.onOpenRouteControls).not.toHaveBeenCalled();
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open inspector"]')
        ?.click(),
    );
    expect(handlers.onToggleInspector).toHaveBeenCalledTimes(1);
  });

  it("opens settings through the supplied navigation action", () => {
    render();
    const settings = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open settings"]',
    );
    expect(settings?.title).toBe("Settings");
    act(() => settings?.click());
    expect(handlers.onOpenSettings).toHaveBeenCalledOnce();
  });

  it("keeps history available in the options menu", () => {
    render({ surface: "history" });
    const history = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Conversation history",
    );
    act(() => history?.click());
    expect(handlers.onSurfaceChange).toHaveBeenCalledWith("history");
  });

  it("avoids duplicate Library and Computer controls and dispatches host view actions", () => {
    render();
    const button = (label: string) =>
      Array.from(container.querySelectorAll("button")).find(
        (entry) => entry.textContent === label,
      );
    expect(button("Library")).toBeUndefined();
    expect(button("Computer")).toBeUndefined();
    const create = vi.fn();
    const close = vi.fn();
    window.addEventListener("doolittle:new-conversation-view", create);
    window.addEventListener("doolittle:close-conversation-view", close);
    try {
      act(() => button("New conversation")?.click());
      act(() => button("Close view")?.click());
      expect(create).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("doolittle:new-conversation-view", create);
      window.removeEventListener("doolittle:close-conversation-view", close);
    }
  });

  it("reveals conversation state and forwards the compact actions", () => {
    render({
      isNewConversation: false,
      selectedContextLabel: "72%",
      selectedContextPercent: 72,
      selectedMessageCount: 6,
      selectedSession: {
        sessionId: "session-1",
        title: "Review the repository",
        messageCount: 6,
        participants: ["user", "assistant"],
        pinned: false,
        preview: [],
      },
      selectedUpdatedAt: "2026-08-12T12:00:00.000Z",
    });

    expect(container.textContent).toContain("Pin conversation");
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Pin conversation")
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label^="Model options"]')
        ?.click(),
    );
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Prepare context compression")
        ?.click(),
    );

    expect(handlers.onTogglePin).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenRouteControls).not.toHaveBeenCalled();
    expect(handlers.onPrepareCompression).not.toHaveBeenCalled();
  });

  it("keeps embedded resource paths out of the chat header", () => {
    render({
      isNewConversation: false,
      selectedSession: {
        sessionId: "session-resource",
        title: "[Embedded resource: /Users/symbiex/dev/test/package.json]",
        messageCount: 1,
        participants: ["user"],
        pinned: false,
        preview: [],
      },
    });

    expect(container.textContent).not.toContain(
      "/Users/symbiex/dev/test/package.json",
    );
  });
});
