// @vitest-environment jsdom

import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopSidebar, type DesktopSidebarProps } from "./DesktopSidebar";

const { copyContextTextMock } = vi.hoisted(() => ({
  copyContextTextMock: vi.fn(async () => undefined),
}));
vi.mock("../context-menu-clipboard", () => ({
  copyContextText: copyContextTextMock,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const bots: BotSummary[] = [
  {
    id: "lead",
    agentId: "lead-agent",
    name: "Doolittle",
    persona: "Lead",
    model: { provider: "test", model: "test" },
    permissions: {
      connectionIds: [],
      workspacePaths: [],
      toolIds: [],
      allowMutation: false,
      allowDelegation: false,
    },
    workspacePath: "",
    isDefault: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    state: "ready",
    activeRunCount: 0,
  },
  {
    id: "research",
    agentId: "research-agent",
    name: "Research",
    persona: "Research",
    model: { provider: "test", model: "test" },
    permissions: {
      connectionIds: [],
      workspacePaths: [],
      toolIds: [],
      allowMutation: false,
      allowDelegation: false,
    },
    workspacePath: "",
    isDefault: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    state: "busy",
    activeRunCount: 1,
  },
];

describe("DesktopSidebar companion navigation", () => {
  let container: HTMLDivElement;
  let root: Root;
  let props: DesktopSidebarProps;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    props = {
      isMobileSidebarMode: false,
      mobileSidebarOpen: false,
      navCollapsed: false,
      sidebarOpen: true,
      sidebarWidth: 248,
      selectedBotId: "research",
      defaultBotId: "lead",
      bots,
      botStatus: "ready",
      botError: "",
      sessions: [
        {
          sessionId: "a",
          botId: "lead",
          title: "Lead thread",
          messageCount: 1,
          participants: ["user"],
          preview: [],
        },
        {
          sessionId: "b",
          botId: "research",
          title: "Research thread",
          messageCount: 1,
          participants: ["user"],
          preview: [],
        },
      ],
      selectedSession: "b",
      projectScope: "all",
      platform: "darwin",
      sidebarRef: { current: null },
      onSidebarKeyDown: vi.fn(),
      onClose: vi.fn(),
      onResize: vi.fn(),
      onToggleNavigation: vi.fn(),
      onOpenPalette: vi.fn(),
      onStartConversation: vi.fn(),
      onOpenSession: vi.fn(),
      onSelectBot: vi.fn(),
      onAddBot: vi.fn(),
      onRetryBots: vi.fn(),
      onSetView: vi.fn(),
      navigationView: "chat",
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows real contacts and only selected bot's recent threads", () => {
    act(() => root.render(<DesktopSidebar {...props} />));
    expect(container.textContent).toContain("Doolittle");
    expect(container.textContent).toContain("Research thread");
    expect(container.textContent).not.toContain("Lead thread");
    expect(container.textContent).toContain("Team & work");
    expect(
      container.querySelector('nav[aria-label="Other areas"]')?.textContent,
    ).not.toContain("Settings");
    const research = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (button) =>
        button.textContent?.includes("Research") &&
        button.classList.contains("dl-contact"),
    );
    act(() => research?.click());
    expect(props.onSelectBot).toHaveBeenCalledWith("research");
    const thread = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Research thread");
    act(() => thread?.click());
    expect(props.onOpenSession).toHaveBeenCalledWith("b");
  });

  it("keeps actionable catalog loading and error states distinct", () => {
    act(() =>
      root.render(<DesktopSidebar {...props} bots={[]} botStatus="loading" />),
    );
    expect(container.textContent).toContain("Loading bots");
    act(() =>
      root.render(
        <DesktopSidebar
          {...props}
          bots={[]}
          botError="Unavailable"
          botStatus="error"
        />,
      ),
    );
    expect(container.textContent).toContain("Bots unavailable");
    act(() =>
      container
        .querySelector<HTMLButtonElement>("button.text-sm.underline")
        ?.click(),
    );
    expect(props.onRetryBots).toHaveBeenCalledOnce();
  });

  it("keeps the mobile scrim pointer-only and outside the focus order", () => {
    act(() =>
      root.render(
        <DesktopSidebar {...props} isMobileSidebarMode mobileSidebarOpen />,
      ),
    );
    const scrim = container.querySelector<HTMLButtonElement>(".sidebar-scrim");
    expect(scrim?.tabIndex).toBe(-1);
    expect(scrim?.getAttribute("aria-hidden")).toBe("true");
  });

  it("opens bot actions without selecting another bot and routes management through the host", async () => {
    act(() => root.render(<DesktopSidebar {...props} />));
    const research = [
      ...container.querySelectorAll<HTMLButtonElement>(".dl-contact"),
    ].find((button) => button.textContent?.includes("Research"));
    await act(async () => {
      research?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
    expect(props.onSelectBot).not.toHaveBeenCalled();
    const manage = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Manage bots…");
    act(() => manage?.click());
    expect(props.onSetView).toHaveBeenCalledWith("orchestration");
    expect(props.onSelectBot).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
  });

  it("offers the same recent-conversation actions from its overflow button and keyboard", async () => {
    act(() => root.render(<DesktopSidebar {...props} />));
    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Research thread actions"]',
    );
    await act(async () => trigger?.click());
    const copyId = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Copy conversation ID");
    await act(async () => copyId?.click());
    expect(copyContextTextMock).toHaveBeenCalledWith("b");
    expect(props.onOpenSession).not.toHaveBeenCalled();
    const thread = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Research thread");
    thread?.focus();
    await act(async () =>
      thread?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    const open = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent === "Open conversation");
    expect(open).toBeDefined();
    await act(async () => open?.click());
    expect(props.onOpenSession).toHaveBeenCalledWith("b");
  });
});
