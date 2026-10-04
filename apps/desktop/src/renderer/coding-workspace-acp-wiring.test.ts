import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { submitAcpEditorTask } from "./coding-workspace/acp-task";
import {
  type CodingWorkspaceAcpViewModel,
  CodingWorkspaceEditor,
} from "./coding-workspace/CodingWorkspaceEditor";

const codeEditorModule = vi.hoisted(() => vi.fn());
const codingWorkspacePageSource = readFileSync(
  new URL("./CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);

vi.mock("./components/CodeEditor", async () => {
  codeEditorModule();
  const { createElement } = await import("react");
  return {
    CodeEditor: ({ path }: { path: string }) =>
      createElement("div", { "data-code-editor-path": path }),
  };
});

const acpEditor: CodingWorkspaceAcpViewModel = {
  cancel: vi.fn().mockResolvedValue(undefined),
  error: "",
  lastUpdateLabel: "",
  phase: "connected",
  promptBusy: false,
  promptError: "",
  promptPhase: "idle",
  responseText: "",
  retryConnection: vi.fn().mockResolvedValue(undefined),
  sessionId: "session-1",
  stopReason: "",
  updates: [],
};

const changedFile = {
  path: "src/index.ts",
  indexStatus: " ",
  worktreeStatus: "M",
  staged: false,
  unstaged: true,
  untracked: false,
};

describe("Code workspace ACP task wiring", () => {
  it.each([
    { selectedPath: "", selectedChange: undefined, label: "No file selected" },
    {
      selectedPath: "src/index.ts",
      selectedChange: undefined,
      label: "File selected",
    },
    { selectedPath: "src/index.ts", selectedChange: changedFile, label: "M" },
    {
      selectedPath: "src/index.ts",
      selectedChange: { ...changedFile, untracked: true },
      label: "U",
    },
  ])(
    "projects file status as $label without inventing Git tracking",
    ({ selectedPath, selectedChange, label }) => {
      const markup = renderToStaticMarkup(
        createElement(CodingWorkspaceEditor, {
          acpEditor,
          acpTaskDraft: "",
          acpTaskOpen: false,
          draftContent: "",
          editingLocked: false,
          editorPane: "file",
          fileDirty: false,
          fileNotice: null,
          fileResource: {
            data: null,
            error: "",
            loading: true,
            reload: vi.fn(),
          },
          onAcpTaskDraftChange: vi.fn(),
          onAcpTaskOpenChange: vi.fn(),
          onDiscard: vi.fn(),
          onDraftChange: vi.fn(),
          onEditorPaneChange: vi.fn(),
          onEditorStateChange: vi.fn(),
          onMutateVisiblePatch: vi.fn(),
          onSave: vi.fn(),
          onSendSelectedContext: vi.fn(),
          onSetStagedPatch: vi.fn(),
          onSubmitAcpTask: vi.fn(),
          patchResource: {
            data: null,
            error: "",
            loading: false,
            reload: vi.fn(),
          },
          savingFile: false,
          selectedChange,
          selectedLanguage: { id: "typescript", label: "TypeScript" },
          selectedPath,
          stagedPatch: false,
          workspacePath: "/work/doolittle",
        }),
      );
      const footer = markup.match(/<footer[\s\S]*?<\/footer>/u)?.[0];
      expect(footer).toContain(`<span>${label}</span>`);
      expect(footer).not.toContain("TRACKED");
      expect(footer).toContain(">ACP task</button>");
    },
  );

  it("prevents browser form submission and sends the exact editor task", async () => {
    const preventDefault = vi.fn();
    const prompt = vi.fn().mockResolvedValue(undefined);

    await submitAcpEditorTask(
      { preventDefault },
      prompt,
      "Inspect the selected file",
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(prompt).toHaveBeenCalledExactlyOnceWith("Inspect the selected file");
  });

  it("prevents ACP form submission before its locked-editing early return", () => {
    const preventDefault = codingWorkspacePageSource.indexOf(
      "event.preventDefault();",
    );
    const editingLock = codingWorkspacePageSource.indexOf(
      "if (!active || editingLocked) {",
    );

    expect(preventDefault).toBeGreaterThan(-1);
    expect(editingLock).toBeGreaterThan(preventDefault);
  });

  it("renders ACP execution and chat handoff as separate actions", () => {
    const markup = renderToStaticMarkup(
      createElement(CodingWorkspaceEditor, {
        acpEditor,
        acpTaskDraft: "Inspect the selected file",
        acpTaskOpen: true,
        draftContent: "",
        editingLocked: false,
        editorPane: "file",
        fileDirty: false,
        fileNotice: null,
        fileResource: {
          data: null,
          error: "",
          loading: true,
          reload: vi.fn(),
        },
        onAcpTaskDraftChange: vi.fn(),
        onAcpTaskOpenChange: vi.fn(),
        onDiscard: vi.fn(),
        onDraftChange: vi.fn(),
        onEditorPaneChange: vi.fn(),
        onEditorStateChange: vi.fn(),
        onMutateVisiblePatch: vi.fn(),
        onSave: vi.fn(),
        onSendSelectedContext: vi.fn(),
        onSetStagedPatch: vi.fn(),
        onSubmitAcpTask: vi.fn(),
        patchResource: {
          data: null,
          error: "",
          loading: false,
          reload: vi.fn(),
        },
        savingFile: false,
        selectedChange: undefined,
        selectedLanguage: { id: "typescript", label: "TypeScript" },
        selectedPath: "src/index.ts",
        stagedPatch: false,
        workspacePath: "/work/doolittle",
      }),
    );

    expect(markup).toContain('aria-label="ACP editor task"');
    expect(markup).toContain(
      '<button class="primary-button" type="submit">Run</button>',
    );
    expect(markup).toContain(">ACP task</button>");
    expect(markup).toContain(">Ask Doolittle</button>");
    expect(codeEditorModule).not.toHaveBeenCalled();
  });

  it("renders a recovery action when ACP is offline", () => {
    const markup = renderToStaticMarkup(
      createElement(CodingWorkspaceEditor, {
        acpEditor: {
          ...acpEditor,
          error: "runtime unavailable",
          phase: "degraded",
        },
        acpTaskDraft: "",
        acpTaskOpen: false,
        draftContent: "",
        editingLocked: false,
        editorPane: "file",
        fileDirty: false,
        fileNotice: null,
        fileResource: {
          data: null,
          error: "",
          loading: true,
          reload: vi.fn(),
        },
        onAcpTaskDraftChange: vi.fn(),
        onAcpTaskOpenChange: vi.fn(),
        onDiscard: vi.fn(),
        onDraftChange: vi.fn(),
        onEditorPaneChange: vi.fn(),
        onEditorStateChange: vi.fn(),
        onMutateVisiblePatch: vi.fn(),
        onSave: vi.fn(),
        onSendSelectedContext: vi.fn(),
        onSetStagedPatch: vi.fn(),
        onSubmitAcpTask: vi.fn(),
        patchResource: {
          data: null,
          error: "",
          loading: false,
          reload: vi.fn(),
        },
        savingFile: false,
        selectedChange: undefined,
        selectedLanguage: { id: "typescript", label: "TypeScript" },
        selectedPath: "src/index.ts",
        stagedPatch: false,
        workspacePath: "/work/doolittle",
      }),
    );

    expect(markup).toContain(">Retry ACP</button>");
  });

  it("loads the editor only after the selected file is ready", async () => {
    const readyFile = {
      acpEditor,
      acpTaskDraft: "",
      acpTaskOpen: false,
      draftContent: "export {};",
      editingLocked: false,
      editorPane: "file" as const,
      fileDirty: false,
      fileNotice: null,
      fileResource: {
        data: { content: "export {};", path: "src/index.ts" },
        error: "",
        loading: false,
        reload: vi.fn(),
      },
      onAcpTaskDraftChange: vi.fn(),
      onAcpTaskOpenChange: vi.fn(),
      onDiscard: vi.fn(),
      onDraftChange: vi.fn(),
      onEditorPaneChange: vi.fn(),
      onEditorStateChange: vi.fn(),
      onMutateVisiblePatch: vi.fn(),
      onSave: vi.fn(),
      onSendSelectedContext: vi.fn(),
      onSetStagedPatch: vi.fn(),
      onSubmitAcpTask: vi.fn(),
      patchResource: {
        data: null,
        error: "",
        loading: false,
        reload: vi.fn(),
      },
      savingFile: false,
      selectedChange: undefined,
      selectedLanguage: { id: "typescript", label: "TypeScript" },
      selectedPath: "src/index.ts",
      stagedPatch: false,
      workspacePath: "/work/doolittle",
    };

    const loadingMarkup = renderToStaticMarkup(
      createElement(CodingWorkspaceEditor, readyFile),
    );
    expect(loadingMarkup).toContain("Loading editor index.ts…");
    expect(loadingMarkup).toContain('role="status"');

    await vi.dynamicImportSettled();
    const markup = renderToStaticMarkup(
      createElement(CodingWorkspaceEditor, readyFile),
    );
    expect(markup).toContain('data-code-editor-path="src/index.ts"');
    expect(codeEditorModule).toHaveBeenCalledTimes(1);
  });
});
