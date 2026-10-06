// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InteractiveTerminalHeader } from "./InteractiveTerminalHeader";
import { createInteractiveTerminalTab } from "./interactive-terminal-store";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("InteractiveTerminalHeader", () => {
  it("keeps tab and panel identity while exposing terminal actions", () => {
    const tab = createInteractiveTerminalTab("Terminal 1");
    const markup = renderToStaticMarkup(
      <InteractiveTerminalHeader
        active
        activeCwdLabel="~/repo"
        activeCwdTitle="/work/repo"
        activeShell="zsh"
        activeTabId={tab.id}
        currentStatus="PTY · 100×30"
        hasPriorOutput={false}
        isClosingTab={{}}
        maxTabs={4}
        onBeginRename={vi.fn()}
        onCancelRename={vi.fn()}
        onCloseActiveSession={vi.fn()}
        onClearOutput={vi.fn()}
        onCloseTab={vi.fn()}
        onCreateTab={vi.fn()}
        onInterrupt={vi.fn()}
        onRenameChange={vi.fn()}
        onSaveRename={vi.fn()}
        onSendOutputToChat={vi.fn()}
        onSelectTab={vi.fn()}
        onStart={vi.fn()}
        onTabKeyDown={vi.fn()}
        renameInputRef={{ current: null }}
        renamingTabId={null}
        renamingValue=""
        running={false}
        outputAvailable={false}
        starting={false}
        tabRefs={{ current: {} }}
        tabs={[tab]}
      />,
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain(
      `aria-controls="interactive-terminal-${tab.id}-panel"`,
    );
    expect(markup).toContain(`id="interactive-terminal-${tab.id}-tab"`);
    expect(markup).toContain('aria-label="Create terminal tab"');
    expect(markup).toContain('aria-label="Clear terminal view"');
    expect(markup).toContain('aria-label="Add terminal output to chat"');
    expect(markup).toContain('aria-label="More terminal actions"');
    expect(markup).toContain('aria-label="Open shell"');
    expect(markup).toContain('title="Open shell"');
    expect(markup).toContain("Open shell");
    expect(markup).toContain("~/repo");
    expect(markup).toContain("interactive-terminal-mode hidden");
    expect(markup).toContain("@max-[1180px]/terminal:col-span-full");
    expect(markup.includes("@min-[1280px]/terminal:inline-flex")).toBe(true);
    expect(markup.includes("@min-[1440px]/terminal:inline")).toBe(true);
    expect(markup.includes("@min-[1280px]/terminal:hidden")).toBe(true);
    expect(markup).not.toContain("2xl:inline");
  });

  it("describes starting a new session after preserved output", () => {
    const tab = {
      ...createInteractiveTerminalTab("Terminal 1"),
      output: "prior session output",
    };
    const markup = renderToStaticMarkup(
      <InteractiveTerminalHeader
        active
        activeCwdLabel="~/repo"
        activeShell="zsh"
        activeTabId={tab.id}
        currentStatus="PTY · 100×30"
        hasPriorOutput
        isClosingTab={{}}
        maxTabs={4}
        onBeginRename={vi.fn()}
        onCancelRename={vi.fn()}
        onCloseActiveSession={vi.fn()}
        onClearOutput={vi.fn()}
        onCloseTab={vi.fn()}
        onCreateTab={vi.fn()}
        onInterrupt={vi.fn()}
        onRenameChange={vi.fn()}
        onSaveRename={vi.fn()}
        onSendOutputToChat={vi.fn()}
        onSelectTab={vi.fn()}
        onStart={vi.fn()}
        onTabKeyDown={vi.fn()}
        renameInputRef={{ current: null }}
        renamingTabId={null}
        renamingValue=""
        running={false}
        outputAvailable
        starting={false}
        tabRefs={{ current: {} }}
        tabs={[tab]}
      />,
    );

    expect(markup).toContain("Restart shell");
    expect(markup).toContain('aria-label="Restart shell"');
    expect(markup).toContain('title="Restart shell"');
    expect(markup).not.toContain(">Open shell</button>");
  });

  it("exposes tab actions only for the selected tab at a usable target size", () => {
    const first = createInteractiveTerminalTab("Terminal 1");
    const second = createInteractiveTerminalTab("Terminal 2");
    const markup = renderToStaticMarkup(
      <InteractiveTerminalHeader
        active
        activeCwdLabel="~/repo"
        activeShell="zsh"
        activeTabId={first.id}
        currentStatus="PTY · 100×30"
        hasPriorOutput={false}
        isClosingTab={{}}
        maxTabs={4}
        onBeginRename={vi.fn()}
        onCancelRename={vi.fn()}
        onCloseActiveSession={vi.fn()}
        onClearOutput={vi.fn()}
        onCloseTab={vi.fn()}
        onCreateTab={vi.fn()}
        onInterrupt={vi.fn()}
        onRenameChange={vi.fn()}
        onSaveRename={vi.fn()}
        onSendOutputToChat={vi.fn()}
        onSelectTab={vi.fn()}
        onStart={vi.fn()}
        onTabKeyDown={vi.fn()}
        renameInputRef={{ current: null }}
        renamingTabId={null}
        renamingValue=""
        running={false}
        outputAvailable={false}
        starting={false}
        tabRefs={{ current: {} }}
        tabs={[first, second]}
      />,
    );

    expect(markup.match(/aria-label="Rename terminal/g)).toHaveLength(1);
    expect(markup.match(/aria-label="Close terminal/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Rename terminal Terminal 1"');
    expect(markup).toContain('aria-label="Close terminal Terminal 1"');
    expect(markup).not.toContain('aria-label="Rename terminal Terminal 2"');
    expect(markup).not.toContain('aria-label="Close terminal Terminal 2"');
    const host = document.createElement("div");
    host.innerHTML = markup;
    const selectedTab = host.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    const rename = host.querySelector(
      '[aria-label="Rename terminal Terminal 1"]',
    );
    const close = host.querySelector(
      '[aria-label="Close terminal Terminal 1"]',
    );
    for (const action of [rename, close]) {
      expect(action?.parentElement).toBe(selectedTab?.parentElement);
      expect(selectedTab?.contains(action)).toBe(false);
      expect(action?.className).toContain("size-[var(--control-height)]");
      expect(action?.className).toContain("max-[760px]:min-h-11");
      expect(action?.className).toContain("max-[760px]:min-w-11");
      expect(action?.className).not.toContain("absolute");
      expect(action?.className).not.toContain("opacity-0");
    }
    expect(selectedTab?.className).toContain("h-[var(--control-height)]");
    expect(selectedTab?.className).toContain("max-[760px]:h-11");
    const tablist = host.querySelector('[role="tablist"]');
    const utilities = host.querySelector(
      '[aria-label="Create terminal tab"]',
    )?.parentElement;
    expect(tablist?.className).toContain("@max-[1180px]/terminal:row-start-2");
    expect(utilities?.className).toContain(
      "@max-[1180px]/terminal:row-start-1",
    );
    expect(markup).not.toContain("shadow-[0_0_12px");
  });

  it("keeps the selected tab identity while its name is being edited", () => {
    const tab = createInteractiveTerminalTab("Terminal 1");
    const markup = renderToStaticMarkup(
      <InteractiveTerminalHeader
        active
        activeCwdLabel="~/repo"
        activeShell="zsh"
        activeTabId={tab.id}
        currentStatus="PTY · 100×30"
        hasPriorOutput={false}
        isClosingTab={{}}
        maxTabs={4}
        onBeginRename={vi.fn()}
        onCancelRename={vi.fn()}
        onCloseActiveSession={vi.fn()}
        onClearOutput={vi.fn()}
        onCloseTab={vi.fn()}
        onCreateTab={vi.fn()}
        onInterrupt={vi.fn()}
        onRenameChange={vi.fn()}
        onSaveRename={vi.fn()}
        onSendOutputToChat={vi.fn()}
        onSelectTab={vi.fn()}
        onStart={vi.fn()}
        onTabKeyDown={vi.fn()}
        renameInputRef={{ current: null }}
        renamingTabId={tab.id}
        renamingValue={tab.name}
        running
        outputAvailable={false}
        starting={false}
        tabRefs={{ current: {} }}
        tabs={[tab]}
      />,
    );

    expect(markup).toContain('role="tab"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain(
      `aria-controls="interactive-terminal-${tab.id}-panel"`,
    );
    expect(markup).toContain(`id="interactive-terminal-${tab.id}-tab"`);
    expect(markup).toContain('aria-label="Rename terminal Terminal 1"');
  });

  it("targets an inactive terminal by its own identity for rename and close", async () => {
    const first = createInteractiveTerminalTab("Terminal 1");
    const second = createInteractiveTerminalTab("Terminal 2");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const props = contextHeaderProps({
      activeTabId: first.id,
      tabs: [first, second],
    });
    const open = async () => {
      const target = host.querySelector(
        `#interactive-terminal-${second.id}-tab`,
      );
      await act(async () =>
        target?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
          }),
        ),
      );
      expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
      expect(
        document.body
          .querySelector('[role="menu"]')
          ?.getAttribute("aria-label"),
      ).toBe("Terminal tab: Terminal 2");
    };
    const choose = async (label: string) => {
      const item = [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ].find((entry) => entry.textContent === label);
      expect(item).toBeDefined();
      await act(async () => item?.click());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    };
    try {
      await act(async () =>
        root.render(<InteractiveTerminalHeader {...props} />),
      );
      await open();
      await choose("Rename terminal…");
      expect(props.onBeginRename).toHaveBeenCalledWith(second.id);
      expect(props.onSelectTab).not.toHaveBeenCalled();
      await open();
      await choose("Close terminal tab");
      expect(props.onCloseTab).toHaveBeenCalledWith(second.id);
      expect(props.onCloseActiveSession).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });

  it("keeps active terminal action prerequisites and routes output through existing handlers", async () => {
    const tab = createInteractiveTerminalTab("Terminal 1");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const props = contextHeaderProps({
      activeTabId: tab.id,
      tabs: [tab],
      active: false,
      running: false,
      maxTabs: 1,
    });
    const open = async () => {
      await act(async () =>
        host.querySelector("header")?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
          }),
        ),
      );
      expect(
        document.body
          .querySelector('[role="menu"]')
          ?.getAttribute("aria-label"),
      ).toBe("Terminal actions");
    };
    const item = (label: string) =>
      [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ].find((entry) => entry.textContent?.startsWith(label));
    try {
      await act(async () =>
        root.render(<InteractiveTerminalHeader {...props} />),
      );
      await open();
      for (const label of [
        "New terminal tab",
        "Open shell",
        "Interrupt foreground process",
        "Close shell session",
        "Clear terminal view",
        "Add terminal output to chat",
      ])
        expect(item(label)?.hasAttribute("data-disabled")).toBe(true);
      await act(async () => item("Interrupt foreground process")?.click());
      expect(props.onInterrupt).not.toHaveBeenCalled();
      await act(async () =>
        root.render(
          <InteractiveTerminalHeader
            {...props}
            active
            running
            outputAvailable
          />,
        ),
      );
      expect(item("Clear terminal view")?.hasAttribute("data-disabled")).toBe(
        false,
      );
      await act(async () => item("Add terminal output to chat")?.click());
      expect(props.onSendOutputToChat).toHaveBeenCalledOnce();
      expect(props.onClearOutput).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});

function contextHeaderProps(
  overrides: Partial<ComponentProps<typeof InteractiveTerminalHeader>>,
): ComponentProps<typeof InteractiveTerminalHeader> {
  return {
    active: true,
    activeCwdLabel: "~/repo",
    activeShell: "zsh",
    activeTabId: "",
    currentStatus: "PTY · 100×30",
    hasPriorOutput: false,
    isClosingTab: {},
    maxTabs: 4,
    onBeginRename: vi.fn(),
    onCancelRename: vi.fn(),
    onCloseActiveSession: vi.fn(),
    onClearOutput: vi.fn(),
    onCloseTab: vi.fn(),
    onCreateTab: vi.fn(),
    onInterrupt: vi.fn(),
    onRenameChange: vi.fn(),
    onSaveRename: vi.fn(),
    onSendOutputToChat: vi.fn(),
    onSelectTab: vi.fn(),
    onStart: vi.fn(),
    onTabKeyDown: vi.fn(),
    renameInputRef: { current: null },
    renamingTabId: null,
    renamingValue: "",
    running: false,
    outputAvailable: false,
    starting: false,
    tabRefs: { current: {} },
    tabs: [],
    ...overrides,
  };
}
