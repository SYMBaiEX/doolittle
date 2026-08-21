// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InteractiveTerminalHeader } from "./InteractiveTerminalHeader";
import { createInteractiveTerminalTab } from "./interactive-terminal-store";

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
    expect(markup).toContain("Open shell");
    expect(markup).toContain("~/repo");
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
    expect(markup).toContain("size-6");
    expect(markup).not.toContain("size-5 min-h-5 min-w-5");
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
});
