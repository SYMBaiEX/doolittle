// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodingWorkspaceEditor } from "./CodingWorkspaceEditor";
import { CodingWorkspaceExplorer } from "./CodingWorkspaceExplorer";
import { CodingWorkspaceHeader } from "./CodingWorkspaceHeader";
import { PaneTabs } from "./PaneTabs";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("workspace context actions", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.getSelection()?.removeAllRanges();
    vi.unstubAllGlobals();
  });
  async function context(target: Element | null) {
    expect(target).not.toBeNull();
    await act(async () =>
      target?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 30,
          clientY: 40,
        }),
      ),
    );
    const menu = document.body.querySelector<HTMLElement>('[role="menu"]');
    expect(menu).not.toBeNull();
    return menu;
  }
  function menuItem(label: string) {
    return [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((item) => item.textContent?.startsWith(label));
  }
  async function choose(label: string) {
    const item = menuItem(label);
    expect(item).toBeDefined();
    await act(async () => item?.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
  function editorProps(
    overrides: Partial<ComponentProps<typeof CodingWorkspaceEditor>> = {},
  ): ComponentProps<typeof CodingWorkspaceEditor> {
    return {
      editorPane: "file",
      editingLocked: false,
      onEditorPaneChange: vi.fn(),
      selectedPath: "src/index.ts",
      selectedLanguage: { id: "typescript", label: "TypeScript" },
      selectedChange: undefined,
      stagedPatch: false,
      onSetStagedPatch: vi.fn(),
      fileResource: { data: null, loading: true, error: "", reload: vi.fn() },
      patchResource: { data: null, loading: false, error: "", reload: vi.fn() },
      fileNotice: null,
      fileDirty: true,
      savingFile: false,
      draftContent: "",
      workspacePath: "/work/repo",
      botId: "bot-a",
      originConversationId: "conversation-a",
      acpEditor: {
        cancel: vi.fn().mockResolvedValue(undefined),
        error: "",
        lastUpdateLabel: "",
        phase: "idle",
        promptBusy: false,
        promptError: "",
        promptPhase: "idle",
        responseText: "",
        retryConnection: vi.fn().mockResolvedValue(undefined),
        sessionId: "",
        stopReason: "",
        updates: [],
      },
      acpTaskOpen: false,
      acpTaskDraft: "",
      onDraftChange: vi.fn(),
      onEditorStateChange: vi.fn(),
      onSave: vi.fn(),
      onDiscard: vi.fn(),
      onMutateVisiblePatch: vi.fn(),
      onAcpTaskOpenChange: vi.fn(),
      onAcpTaskDraftChange: vi.fn(),
      onSubmitAcpTask: vi.fn(),
      onSendSelectedContext: vi.fn(),
      ...overrides,
    };
  }

  it("selects fixed pane modes through keyboard context access without adding fake close actions", async () => {
    const onChange = vi.fn();
    await act(async () =>
      root.render(
        <PaneTabs
          label="Explorer views"
          options={[
            { id: "files", label: "Files" },
            { id: "changes", label: "Changes" },
          ]}
          panelId="explorer"
          value="files"
          onChange={onChange}
        />,
      ),
    );
    const tab = host.querySelector<HTMLButtonElement>('[role="tab"]');
    tab?.focus();
    await act(async () =>
      tab?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F10",
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(
      document.body.querySelector('[role="menu"]')?.textContent,
    ).not.toMatch(/Close|Duplicate/u);
    await choose("Show Changes");
    expect(onChange).toHaveBeenCalledWith("changes");
  });

  it("opens the exact changed path and copies bounded search result content", async () => {
    const resource = { data: null, loading: false, error: "", reload: vi.fn() };
    const onOpenPath = vi.fn(() => true);
    const props: ComponentProps<typeof CodingWorkspaceExplorer> = {
      width: 260,
      onResize: vi.fn(),
      leftPane: "changes",
      onLeftPaneChange: vi.fn(),
      treeResource: resource,
      treeEntries: [],
      changesResource: resource,
      changes: [
        {
          path: "src/index.ts",
          indexStatus: " ",
          worktreeStatus: "M",
          staged: false,
          unstaged: true,
          untracked: false,
        },
      ],
      selectedPath: "",
      onOpenPath,
      searchDraft: "needle",
      searchQuery: "needle",
      searchResource: resource,
      searchResults: [
        { path: "README.md", matches: ["1:needle", "2:another needle"] },
      ],
      onSearchDraftChange: vi.fn(),
      onSubmitSearch: vi.fn(),
    };
    await act(async () => root.render(<CodingWorkspaceExplorer {...props} />));
    await context(host.querySelector('[title="src/index.ts"]'));
    await choose("Open diff");
    expect(onOpenPath).toHaveBeenCalledWith("src/index.ts", "diff");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await act(async () =>
      root.render(<CodingWorkspaceExplorer {...props} leftPane="search" />),
    );
    await context(host.querySelector('[title="README.md"]'));
    await choose("Copy matching lines");
    expect(writeText).toHaveBeenCalledWith("1:needle\n2:another needle");
  });

  it.each([
    { fileDirty: false },
    { savingFile: true },
    { editingLocked: true },
  ])("keeps save/discard prerequisites in context menus: %s", async (state) => {
    const props = editorProps(state);
    await act(async () => root.render(<CodingWorkspaceEditor {...props} />));
    await context(host.querySelector(".coding-breadcrumb"));
    expect(
      menuItem(state.savingFile ? "Saving…" : "Save file")?.hasAttribute(
        "data-disabled",
      ),
    ).toBe(true);
    expect(
      menuItem("Discard unsaved edits")?.hasAttribute("data-disabled"),
    ).toBe(true);
    await choose(state.savingFile ? "Saving…" : "Save file");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("uses existing save/discard callbacks and leaves editor content outside the action menu", async () => {
    const props = editorProps();
    await act(async () => root.render(<CodingWorkspaceEditor {...props} />));
    const surface = host.querySelector('[role="tabpanel"]');
    expect(surface?.closest("[data-context-action-menu]")).toBeNull();
    await context(host.querySelector(".coding-breadcrumb"));
    await choose("Save file");
    expect(props.onSave).toHaveBeenCalledOnce();
    await context(host.querySelector(".coding-breadcrumb"));
    await choose("Discard unsaved edits");
    expect(props.onDiscard).toHaveBeenCalledOnce();
  });

  it("routes selected patch operations through the existing confirmed mutation handler", async () => {
    const props = editorProps({
      editorPane: "diff",
      selectedChange: {
        path: "src/index.ts",
        indexStatus: "M",
        worktreeStatus: "M",
        staged: true,
        unstaged: true,
        untracked: false,
      },
      patchResource: {
        data: {
          patch: { patch: "@@ -1 +1 @@\n-before\n+after", truncated: false },
        },
        loading: false,
        error: "",
        reload: vi.fn(),
      },
    });
    await act(async () => root.render(<CodingWorkspaceEditor {...props} />));
    await context(host.querySelector(".coding-breadcrumb"));
    await choose("Stage patch");
    expect(props.onMutateVisiblePatch).toHaveBeenCalledWith("stage-hunk");
    await context(host.querySelector(".coding-breadcrumb"));
    await choose("Discard patch…");
    expect(props.onMutateVisiblePatch).toHaveBeenCalledWith("discard-hunk");
    await act(async () =>
      root.render(<CodingWorkspaceEditor {...props} stagedPatch />),
    );
    await context(host.querySelector(".coding-breadcrumb"));
    expect(menuItem("Discard patch…")).toBeUndefined();
    await choose("Unstage patch");
    expect(props.onMutateVisiblePatch).toHaveBeenCalledWith("unstage-hunk");
  });

  it("omits mutations for truncated and untracked patch cases", async () => {
    const props = editorProps({
      editorPane: "diff",
      selectedChange: {
        path: "src/index.ts",
        indexStatus: "?",
        worktreeStatus: "?",
        staged: false,
        unstaged: true,
        untracked: true,
      },
      patchResource: {
        data: { patch: { patch: "bounded patch", truncated: true } },
        loading: false,
        error: "",
        reload: vi.fn(),
      },
    });
    await act(async () => root.render(<CodingWorkspaceEditor {...props} />));
    await context(host.querySelector(".coding-breadcrumb"));
    expect(menuItem("Stage patch")).toBeUndefined();
    expect(menuItem("Discard patch…")).toBeUndefined();
    await act(async () =>
      root.render(
        <CodingWorkspaceEditor
          {...props}
          patchResource={{
            ...props.patchResource,
            data: { patch: { patch: "new file", truncated: false } },
          }}
        />,
      ),
    );
    await context(host.querySelector(".coding-breadcrumb"));
    expect(menuItem("Stage patch")).toBeDefined();
    expect(menuItem("Discard patch…")).toBeUndefined();
  });

  it("revokes file actions when the owned workspace changes", async () => {
    const props = editorProps();
    await act(async () => root.render(<CodingWorkspaceEditor {...props} />));
    await context(host.querySelector(".coding-breadcrumb"));
    await act(async () =>
      root.render(
        <CodingWorkspaceEditor
          {...props}
          botId="bot-b"
          workspacePath="/other/repo"
        />,
      ),
    );
    expect(document.body.querySelector('[role="menu"]')).toBeNull();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("reuses workspace layout actions and disables offline refresh", async () => {
    const props: ComponentProps<typeof CodingWorkspaceHeader> = {
      active: false,
      explorerVisible: true,
      utilityVisible: false,
      zenMode: false,
      summary: {
        isRepository: false,
        root: "/work/repo",
        ahead: 0,
        behind: 0,
        dirty: false,
        changedFiles: 0,
      },
      hasSummary: true,
      summaryLoading: false,
      summaryError: "",
      surface: "workspace",
      onRefresh: vi.fn(),
      onToggleExplorer: vi.fn(),
      onToggleUtility: vi.fn(),
      onToggleZen: vi.fn(),
      onRetrySummary: vi.fn(),
      onSurfaceChange: vi.fn(),
    };
    await act(async () => root.render(<CodingWorkspaceHeader {...props} />));
    await context(host.querySelector("h1"));
    expect(menuItem("Refresh workspace")?.hasAttribute("data-disabled")).toBe(
      true,
    );
    expect(menuItem("Copy branch name")?.hasAttribute("data-disabled")).toBe(
      true,
    );
    await choose("Show preview");
    expect(props.onSurfaceChange).toHaveBeenCalledWith("preview");
    await context(host.querySelector("h1"));
    await choose("Show utility rail");
    expect(props.onToggleUtility).toHaveBeenCalledOnce();
  });
});
