// @vitest-environment jsdom

import type { BotSummary } from "@doolittle/contracts/bots";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { compile } from "tailwindcss";
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

  it("anchors navigation resizing to its visible full-height edge and reports an owned gesture", async () => {
    const active = vi.fn();
    act(() =>
      root.render(
        <DesktopSidebar
          {...props}
          onResizeActiveChange={active}
          resizeBounds={{ default: 248, min: 220, max: 280 }}
        />,
      ),
    );
    const handle = container.querySelector<HTMLHRElement>(
      'hr[aria-label="Resize bot navigation"]',
    );
    if (!handle?.parentElement) throw new Error("Resize handle not rendered");
    const wrapper = handle.parentElement;
    const compiler = await compile(
      "@theme { --spacing: 0.25rem; } @tailwind utilities;",
    );
    const css = compiler.build(wrapper.className.split(/\s+/u));
    expect(css).toContain("inset-block:");
    expect(css).toContain("right:");
    handle.focus();
    expect(document.activeElement).toBe(handle);
    act(() => {
      handle.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 248 }),
      );
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500 }));
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 500 }));
    });
    expect(props.onResize).toHaveBeenLastCalledWith(280);
    expect(active.mock.calls).toEqual([[true], [false]]);
    act(() => root.render(<DesktopSidebar {...props} navCollapsed />));
    expect(
      container.querySelector('hr[aria-label="Resize bot navigation"]'),
    ).toBeNull();
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

  it("keeps collapsed destinations identifiable and selectable without card highlights", () => {
    act(() => root.render(<DesktopSidebar {...props} navCollapsed />));
    const utilities = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'nav[aria-label="Other areas"] button',
      ),
    ];
    expect(utilities).toHaveLength(2);
    for (const button of utilities) {
      expect(button.querySelector("svg")).not.toBeNull();
      expect(button.title).toBeTruthy();
      expect(button.className).not.toContain("aria-current:bg");
    }
    act(() => utilities[0]?.click());
    expect(props.onSetView).toHaveBeenCalledWith("orchestration");
    expect(container.querySelector(".dl-contact-copy")?.className).toBe(
      "dl-contact-copy",
    );
    expect(
      container.querySelector('[aria-label="Recent conversations"]'),
    ).toBeNull();
  });

  it("makes hidden mobile navigation inert and closes it from its named action", () => {
    act(() => root.render(<DesktopSidebar {...props} isMobileSidebarMode />));
    expect(container.querySelector("aside")?.hasAttribute("inert")).toBe(true);
    act(() =>
      root.render(
        <DesktopSidebar {...props} isMobileSidebarMode mobileSidebarOpen />,
      ),
    );
    expect(container.querySelector("aside")?.hasAttribute("inert")).toBe(false);
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close navigation"]')
        ?.click(),
    );
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onToggleNavigation).not.toHaveBeenCalled();
  });

  it("retains the last bot catalog with an actionable refresh error", () => {
    act(() =>
      root.render(
        <DesktopSidebar
          {...props}
          botStatus="error"
          botError="Refresh failed"
        />,
      ),
    );
    expect(container.textContent).toContain("Showing the last catalog");
    expect(container.querySelectorAll(".dl-contact")).toHaveLength(2);
    const retry = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent === "Retry");
    act(() => retry?.click());
    expect(props.onRetryBots).toHaveBeenCalledOnce();
    const recent = container.querySelector(
      '[aria-label="Recent conversations"]',
    );
    expect(recent?.className).not.toContain("border-l");
    const current = recent?.querySelector('[aria-current="page"]');
    expect(current?.className).toContain("aria-current:font-semibold");
    expect(current?.className).not.toContain("aria-current:bg");
  });

  it("keeps an older current conversation visible without exceeding eight recent rows", () => {
    const seed = props.sessions[1];
    if (!seed) throw new Error("Missing research conversation fixture");
    const history = Array.from({ length: 10 }, (_, index) => ({
      ...seed,
      sessionId: `thread-${index}`,
      title: `Thread ${index}`,
      startedAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
    }));
    act(() =>
      root.render(
        <DesktopSidebar
          {...props}
          sessions={history}
          selectedSession="thread-0"
        />,
      ),
    );
    const recent = container.querySelector(
      '[aria-label="Recent conversations"]',
    );
    expect(recent?.querySelectorAll("button[title^='Thread']")).toHaveLength(8);
    expect(recent?.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Thread 0",
    );
    expect(recent?.textContent).toContain("Thread 9");
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
