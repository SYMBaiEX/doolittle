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
        isClosingTab={{}}
        maxTabs={4}
        onBeginRename={vi.fn()}
        onCancelRename={vi.fn()}
        onCloseActiveSession={vi.fn()}
        onCloseTab={vi.fn()}
        onCreateTab={vi.fn()}
        onInterrupt={vi.fn()}
        onRenameChange={vi.fn()}
        onSaveRename={vi.fn()}
        onSelectTab={vi.fn()}
        onStart={vi.fn()}
        onTabKeyDown={vi.fn()}
        renameInputRef={{ current: null }}
        renamingTabId={null}
        renamingValue=""
        running={false}
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
    expect(markup).toContain("Open shell");
    expect(markup).toContain("~/repo");
  });
});
