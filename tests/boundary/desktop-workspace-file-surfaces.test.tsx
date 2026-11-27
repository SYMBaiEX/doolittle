// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  type CodingWorkspaceAcpViewModel,
  CodingWorkspaceEditor,
} from "../../apps/desktop/src/renderer/coding-workspace/CodingWorkspaceEditor";
import { OpenEditorTabs } from "../../apps/desktop/src/renderer/coding-workspace/OpenEditorTabs";
import { WorkspaceFileTree } from "../../apps/desktop/src/renderer/components/WorkspaceFileTree";

vi.mock("../../apps/desktop/src/renderer/components/CodeEditor", () => ({
  CodeEditor: (props: { wordWrap?: boolean }) => (
    <div data-word-wrap={props.wordWrap ? "on" : "off"} />
  ),
}));

import {
  parseWorkspacePatch,
  WorkspacePatchView,
} from "../../apps/desktop/src/renderer/components/WorkspacePatchView";

const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const originalAct = environment.IS_REACT_ACT_ENVIRONMENT;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  environment.IS_REACT_ACT_ENVIRONMENT = originalAct;
  vi.restoreAllMocks();
});

it("returns focus to the editor canvas when the final document closes", () => {
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const close = vi.fn(() => true);
  const renderTabs = (path: string) =>
    root.render(
      <>
        <OpenEditorTabs
          disabled={false}
          documents={path ? [{ path, dirty: false }] : []}
          onClose={close}
          onOpen={() => true}
          panelId="editor-canvas"
          scopeKey="workspace"
          selectedPath={path}
        />
        <section aria-label="File editor" id="editor-canvas" tabIndex={-1} />
      </>,
    );

  act(() => renderTabs("file.ts"));
  expect(host.querySelector('[role="tablist"]')).not.toBeNull();
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Close file.ts"]')
      ?.click(),
  );
  expect(close).toHaveBeenCalledExactlyOnceWith("file.ts");
  act(() => renderTabs(""));
  act(() => frame?.(0));
  expect(host.querySelector(".ide-document-bar")).toBeNull();
  expect(document.activeElement?.id).toBe("editor-canvas");
});

it("numbers real hunk rows without treating file headers as changes", () => {
  const patch = [
    "--- a/src/main.ts",
    "+++ b/src/main.ts",
    "@@ -11,2 +11,2 @@",
    " same",
    "-previous",
    "+++ added source",
    "\\ No newline at end of file",
    "@@ -25,0 +26 @@",
    "+new statement",
    "",
  ].join("\r\n");

  expect(parseWorkspacePatch(patch)).toMatchObject({
    additions: 2,
    removals: 1,
    lines: [
      { kind: "metadata", text: "--- a/src/main.ts" },
      { kind: "metadata", text: "+++ b/src/main.ts" },
      { kind: "hunk" },
      { kind: "context", oldNumber: 11, newNumber: 11 },
      { kind: "removal", oldNumber: 12, text: "-previous" },
      { kind: "addition", newNumber: 12, text: "+++ added source" },
      { kind: "metadata" },
      { kind: "hunk" },
      { kind: "addition", newNumber: 26 },
    ],
  });
});

it("wraps a partial patch while copying the exact received text", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const patch = "@@ -1 +1 @@\r\n-previous\r\n+next\r\n";
  try {
    act(() => root.render(<WorkspacePatchView patch={patch} truncated />));
    expect(host.textContent).toContain("Partial patch");
    const wrap = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Wrap lines"]',
    );
    act(() => wrap?.click());
    expect(wrap?.getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("[data-wrap=true]")).not.toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('button[aria-label="Copy diff"]')
        ?.click(),
    );
    expect(writeText).toHaveBeenCalledExactlyOnceWith(patch);
  } finally {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

it("reveals the selected file, exposes Git status, and restores the tree after filtering", () => {
  const open = vi.fn();
  act(() =>
    root.render(
      <WorkspaceFileTree
        entries={[
          { path: "src/nested/engine.ts", type: "file", depth: 2 },
          { path: "README.md", type: "file", depth: 0 },
        ]}
        filterable
        onOpenFile={open}
        selectedPath="src/nested/engine.ts"
        statuses={
          new Map([
            [
              "src/nested/engine.ts",
              { code: "M", label: "Modified · Working tree", tone: "changed" },
            ],
          ])
        }
      />,
    ),
  );
  const engine = host.querySelector<HTMLButtonElement>(
    '[role="treeitem"][aria-selected="true"]',
  );
  expect(engine?.textContent).toContain("engine.ts");
  expect(engine?.getAttribute("aria-description")).toBe(
    "Modified · Working tree",
  );
  expect(host.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(
    1,
  );
  act(() => engine?.click());
  expect(open).toHaveBeenCalledExactlyOnceWith("src/nested/engine.ts");

  const filterButton = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Filter workspace files"]',
  );
  act(() => filterButton?.click());
  const filter = host.querySelector<HTMLInputElement>("input");
  expect(document.activeElement).toBe(filter);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(filter, "readme");
    filter?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelector('[role="tree"]')?.textContent).toBe("README.md");
  act(() =>
    filter?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(filterButton);
  expect(host.querySelector('[role="tree"]')?.textContent).toContain(
    "engine.ts",
  );
});

it("toggles line wrapping for the file editor only", async () => {
  const acpEditor: CodingWorkspaceAcpViewModel = {
    cancel: vi.fn(),
    error: "",
    lastUpdateLabel: "",
    phase: "idle",
    promptBusy: false,
    promptError: "",
    promptPhase: "idle",
    responseText: "",
    retryConnection: vi.fn(),
    sessionId: "",
    stopReason: "",
    updates: [],
  };
  const fileResource = {
    data: { path: ".env.example", content: "A=1" },
    error: "",
    loading: false,
    reload: vi.fn(),
  };
  const patchResource = {
    data: null,
    error: "",
    loading: false,
    reload: vi.fn(),
  };
  const renderEditor = (editorPane: "file" | "diff") =>
    root.render(
      <CodingWorkspaceEditor
        acpEditor={acpEditor}
        acpTaskDraft=""
        acpTaskOpen={false}
        draftContent="A=1"
        editingLocked={false}
        editorPane={editorPane}
        fileDirty={false}
        fileNotice={null}
        fileResource={fileResource}
        onAcpTaskDraftChange={() => undefined}
        onAcpTaskOpenChange={() => undefined}
        onCloseDocument={() => true}
        onDiscard={() => undefined}
        onDraftChange={() => undefined}
        onEditorPaneChange={() => undefined}
        onEditorStateChange={() => undefined}
        onMutateVisiblePatch={() => undefined}
        onOpenDocument={() => true}
        onOverwriteConflict={() => undefined}
        onReloadConflict={() => undefined}
        onSave={() => undefined}
        onSendSelectedContext={() => undefined}
        onSetStagedPatch={() => undefined}
        onSubmitAcpTask={() => undefined}
        openDocuments={[{ path: ".env.example", dirty: false }]}
        patchResource={patchResource}
        savingFile={false}
        selectedChange={undefined}
        selectedLanguage={{ id: "ini", label: "Environment" }}
        selectedPath=".env.example"
        stagedPatch={false}
        workspacePath="/repo"
      />,
    );

  await act(async () => renderEditor("file"));
  const wrap = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Wrap lines"]',
  );
  expect(wrap).not.toBeNull();
  expect(wrap?.getAttribute("aria-pressed")).toBe("false");
  expect(host.querySelector("[data-word-wrap='off']")).not.toBeNull();

  act(() => wrap?.click());
  expect(wrap?.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector("[data-word-wrap='on']")).not.toBeNull();

  await act(async () => renderEditor("diff"));
  expect(host.querySelector('button[aria-label="Wrap lines"]')).toBeNull();
});

it("offers explicit overwrite and reload choices for a save conflict", async () => {
  const acpEditor: CodingWorkspaceAcpViewModel = {
    cancel: vi.fn(),
    error: "",
    lastUpdateLabel: "",
    phase: "idle",
    promptBusy: false,
    promptError: "",
    promptPhase: "idle",
    responseText: "",
    retryConnection: vi.fn(),
    sessionId: "",
    stopReason: "",
    updates: [],
  };
  const fileResource = {
    data: { path: "notes.txt", content: "disk version" },
    error: "",
    loading: false,
    reload: vi.fn(),
  };
  const patchResource = {
    data: null,
    error: "",
    loading: false,
    reload: vi.fn(),
  };
  const onOverwriteConflict = vi.fn();
  const onReloadConflict = vi.fn();
  const renderEditor = (fileConflict: boolean) =>
    root.render(
      <CodingWorkspaceEditor
        acpEditor={acpEditor}
        acpTaskDraft=""
        acpTaskOpen={false}
        draftContent="user work"
        editingLocked={false}
        editorPane="file"
        fileConflict={fileConflict}
        fileDirty
        fileNotice={null}
        fileResource={fileResource}
        onAcpTaskDraftChange={() => undefined}
        onAcpTaskOpenChange={() => undefined}
        onCloseDocument={() => true}
        onDiscard={() => undefined}
        onDraftChange={() => undefined}
        onEditorPaneChange={() => undefined}
        onEditorStateChange={() => undefined}
        onMutateVisiblePatch={() => undefined}
        onOpenDocument={() => true}
        onOverwriteConflict={onOverwriteConflict}
        onReloadConflict={onReloadConflict}
        onSave={() => undefined}
        onSendSelectedContext={() => undefined}
        onSetStagedPatch={() => undefined}
        onSubmitAcpTask={() => undefined}
        openDocuments={[{ path: "notes.txt", dirty: true }]}
        patchResource={patchResource}
        savingFile={false}
        selectedChange={undefined}
        selectedLanguage={{ id: "plaintext", label: "Plain text" }}
        selectedPath="notes.txt"
        stagedPatch={false}
        workspacePath="/repo"
      />,
    );

  await act(async () => renderEditor(true));
  const banner = host.querySelector('[role="alert"]');
  expect(banner?.textContent).toContain("changed on disk");
  const overwrite = Array.from(banner?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent === "Overwrite workspace copy",
  );
  const reload = Array.from(banner?.querySelectorAll("button") ?? []).find(
    (button) => button.textContent === "Reload from disk",
  );
  if (!overwrite || !reload)
    throw new Error("Conflict resolution actions were not rendered.");
  act(() => overwrite.click());
  expect(onOverwriteConflict).toHaveBeenCalledTimes(1);
  act(() => reload.click());
  expect(onReloadConflict).toHaveBeenCalledTimes(1);

  await act(async () => renderEditor(false));
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("blocks binary and oversized files with a clear message instead of the editor", async () => {
  const acpEditor: CodingWorkspaceAcpViewModel = {
    cancel: vi.fn(),
    error: "",
    lastUpdateLabel: "",
    phase: "idle",
    promptBusy: false,
    promptError: "",
    promptPhase: "idle",
    responseText: "",
    retryConnection: vi.fn(),
    sessionId: "",
    stopReason: "",
    updates: [],
  };
  const patchResource = {
    data: null,
    error: "",
    loading: false,
    reload: vi.fn(),
  };
  const renderEditor = (data: Record<string, unknown>) =>
    root.render(
      <CodingWorkspaceEditor
        acpEditor={acpEditor}
        acpTaskDraft=""
        acpTaskOpen={false}
        draftContent=""
        editingLocked={false}
        editorPane="file"
        fileConflict={false}
        fileDirty={false}
        fileNotice={null}
        fileResource={{ data, error: "", loading: false, reload: vi.fn() }}
        onAcpTaskDraftChange={() => undefined}
        onAcpTaskOpenChange={() => undefined}
        onCloseDocument={() => true}
        onDiscard={() => undefined}
        onDraftChange={() => undefined}
        onEditorPaneChange={() => undefined}
        onEditorStateChange={() => undefined}
        onMutateVisiblePatch={() => undefined}
        onOpenDocument={() => true}
        onOverwriteConflict={() => undefined}
        onReloadConflict={() => undefined}
        onSave={() => undefined}
        onSendSelectedContext={() => undefined}
        onSetStagedPatch={() => undefined}
        onSubmitAcpTask={() => undefined}
        openDocuments={[{ path: "image.png", dirty: false }]}
        patchResource={patchResource}
        savingFile={false}
        selectedChange={undefined}
        selectedLanguage={{ id: "plaintext", label: "Plain text" }}
        selectedPath="image.png"
        stagedPatch={false}
        workspacePath="/repo"
      />,
    );

  await act(async () =>
    renderEditor({ path: "image.png", binary: true, sizeBytes: 42 }),
  );
  expect(host.textContent).toContain("Binary file");
  expect(host.textContent).toContain("corrupting");
  expect(host.querySelector("[data-word-wrap]")).toBeNull();

  await act(async () =>
    renderEditor({
      path: "image.png",
      tooLarge: true,
      sizeBytes: 2_500_000,
      limitBytes: 1_000_000,
    }),
  );
  expect(host.textContent).toContain("File too large to edit");
  expect(host.textContent).toContain("2.5 MB");
  expect(host.textContent).toContain("1.0 MB");
  expect(host.querySelector("[data-word-wrap]")).toBeNull();

  await act(async () => renderEditor({ path: "image.png", content: "text" }));
  expect(host.textContent).not.toContain("Binary file");
});
