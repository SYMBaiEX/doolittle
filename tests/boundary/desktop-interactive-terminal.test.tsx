// @vitest-environment jsdom
import { act, type RefObject } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ChatTerminalPanel } from "../../apps/desktop/src/renderer/app-shell/ChatTerminalPanel";
import {
  InteractiveTerminalHeader,
  InteractiveTerminalStatus,
} from "../../apps/desktop/src/renderer/components/InteractiveTerminalHeader";
import { InteractiveTerminalSurface } from "../../apps/desktop/src/renderer/components/InteractiveTerminalSurface";
import {
  createInteractiveTerminalTab,
  parseInteractiveTerminalState,
} from "../../apps/desktop/src/renderer/components/interactive-terminal-store";

// The native acceptance journey drives the real PTY. This stub isolates the
// dock's visibility and conversation identity from shell processes in jsdom.
vi.mock(
  "../../apps/desktop/src/renderer/components/InteractiveTerminal",
  () => ({
    InteractiveTerminal: ({
      active,
      focusRequest,
    }: {
      active: boolean;
      focusRequest?: number;
    }) => (
      <div data-terminal-stub data-active={active} data-focus={focusRequest} />
    ),
  }),
);

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

it("links the active shell to the viewport and provides keyboard actions and authoritative status", () => {
  const interrupt = vi.fn();
  const rename = vi.fn();
  const noop = vi.fn();
  const activeTab = {
    ...createInteractiveTerminalTab("Project shell"),
    state: "running" as const,
    startedAt: "2026-11-21T00:00:00.000Z",
    pty: true,
    shell: "/bin/zsh",
    cwd: "/fixture/project",
  };
  const tabs = [activeTab, createInteractiveTerminalTab("Build logs")];
  const panelId = "terminal-fixture";
  const tabRefs: RefObject<Record<string, HTMLButtonElement | null>> = {
    current: {},
  };

  act(() =>
    root.render(
      <>
        <InteractiveTerminalHeader
          active
          activeTabId={activeTab.id}
          hasPriorOutput
          isClosingTab={{}}
          maxTabs={4}
          onBeginRename={rename}
          onCancelRename={noop}
          onClearOutput={noop}
          onCloseActiveSession={noop}
          onCloseTab={noop}
          onCreateTab={noop}
          onInterrupt={interrupt}
          onRenameChange={noop}
          onSaveRename={noop}
          onSelectTab={noop}
          onSendOutputToChat={noop}
          onStart={noop}
          onTabKeyDown={noop}
          outputAvailable
          panelId={panelId}
          renameInputRef={{ current: null }}
          renamingTabId={null}
          renamingValue=""
          running
          starting={false}
          tabRefs={tabRefs}
          tabs={tabs}
        />
        <InteractiveTerminalSurface
          active
          activeTab={activeTab}
          canRetryOutput={false}
          notice=""
          onRetryOutput={noop}
          onStart={noop}
          panelId={panelId}
          running
          starting={false}
          viewportRef={{ current: null }}
        />
        <InteractiveTerminalStatus
          activeTab={activeTab}
          cwdLabel="fixture/project"
          dimensions="100×20"
          starting={false}
        />
      </>,
    ),
  );

  const defaultTab = tabRefs.current[activeTab.id];
  if (!defaultTab) throw new Error("Expected terminal tab");
  expect(defaultTab.tabIndex).toBe(0);
  expect(defaultTab.getAttribute("aria-description")).toBe("Running");
  expect(tabRefs.current[tabs[1].id]?.tabIndex).toBe(-1);
  expect(tabRefs.current[tabs[1].id]?.getAttribute("aria-description")).toBe(
    "Ready to open",
  );
  const viewport = host.querySelector('[role="tabpanel"]');
  expect(viewport?.id).toBe(defaultTab.getAttribute("aria-controls"));
  expect(viewport?.getAttribute("aria-labelledby")).toBe(defaultTab.id);
  expect(host.querySelector(".interactive-terminal-mode")?.textContent).toBe(
    "PTY · zsh · 100×20",
  );
  expect(host.querySelector(".interactive-terminal-state")?.textContent).toBe(
    "Running",
  );
  act(() => {
    defaultTab.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
    );
    host
      .querySelector<HTMLButtonElement>(
        '[aria-label="Interrupt foreground process"]',
      )
      ?.click();
  });
  expect(rename).toHaveBeenCalledWith(activeTab.id);
  expect(interrupt).toHaveBeenCalledOnce();
});

it("restores native-owned shell tabs and drops older unowned managed entries", () => {
  const nativeTab = {
    ...createInteractiveTerminalTab("Project shell"),
    sessionId: "native-session",
    state: "running",
    output: "owned output",
  };
  const discovered = {
    ...createInteractiveTerminalTab("App · Other project"),
    id: "app-foreign-session",
    sessionId: "foreign-session",
    state: "running",
  };
  expect(
    parseInteractiveTerminalState({
      activeTabId: discovered.id,
      tabs: [nativeTab, discovered],
    }),
  ).toMatchObject({
    activeTabId: nativeTab.id,
    tabs: [{ id: nativeTab.id, output: "owned output" }],
  });
});

it("keeps the shared same-owner terminal mounted across visibility changes", () => {
  const workspacePath = "/fixture/project";
  const render = (open: boolean, originConversationId = "coding-chat") => {
    act(() =>
      root.render(
        <ChatTerminalPanel
          active
          focusRequest={3}
          height={300}
          onClose={() => undefined}
          onResize={() => undefined}
          onSendToChat={() => undefined}
          open={open}
          origin={{ botId: "doolittle", originConversationId, workspacePath }}
          platform="darwin"
          workspacePath={workspacePath}
        />,
      ),
    );
    return host.querySelector<HTMLElement>("[data-terminal-stub]");
  };

  const first = render(true);
  expect(first?.dataset.active).toBe("true");
  expect(render(false)).toBe(first);
  expect(first?.dataset.active).toBe("false");
  expect(
    host
      .querySelector("[data-chat-terminal-panel]")
      ?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(render(true)).toBe(first);
  expect(first?.dataset.active).toBe("true");
  expect(first?.dataset.focus).toBe("3");
  expect(render(true, "different-chat")).not.toBe(first);
});
