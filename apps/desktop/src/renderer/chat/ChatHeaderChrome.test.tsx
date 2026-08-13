// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatHeaderChrome,
  type ChatHeaderChromeProps,
} from "./ChatHeaderChrome";

const handlers = {
  onCancelRequest: vi.fn(),
  onOpenMobileConversations: vi.fn(),
  onOpenRouteControls: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onPrepareCompression: vi.fn(),
  onToggleInspector: vi.fn(),
  onTogglePin: vi.fn(),
};

const baseProps: ChatHeaderChromeProps = {
  activeRequest: null,
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

    expect(container.textContent).toContain("New conversation");
    expect(container.textContent).toContain("Code");
    expect(container.textContent).toContain("ollama · granite4.1:3b");
    expect(container.textContent).toContain("Workbench");
    expect(container.textContent).not.toContain("0 messages");
    expect(container.textContent).not.toContain("Not started");
    expect(container.textContent).not.toContain("0%");
    expect(
      container.querySelector('[aria-label="Pin conversation"]'),
    ).toBeNull();
  });

  it("reveals conversation state and forwards the compact actions", () => {
    render({
      activeRequest: "request-1",
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

    expect(container.textContent).toContain("6 messages");
    expect(container.textContent).toContain("72%");
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Pin conversation"]')
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label^="Open route controls"]')
        ?.click(),
    );
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Stop response"))
        ?.click(),
    );
    act(() =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("72%"))
        ?.click(),
    );

    expect(handlers.onTogglePin).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenRouteControls).toHaveBeenCalledTimes(1);
    expect(handlers.onCancelRequest).toHaveBeenCalledWith("request-1");
    expect(handlers.onPrepareCompression).toHaveBeenCalledTimes(1);
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

    expect(container.querySelector("h2")?.textContent).toBe(
      "Referenced package.json",
    );
    expect(container.querySelector("h2")?.getAttribute("title")).toBe(
      "Referenced package.json",
    );
    expect(container.textContent).not.toContain(
      "/Users/symbiex/dev/test/package.json",
    );
  });
});
