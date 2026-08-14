import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { submitAcpEditorTask } from "./coding-workspace/acp-task";
import {
  type CodingWorkspaceAcpViewModel,
  CodingWorkspaceEditor,
} from "./coding-workspace/CodingWorkspaceEditor";

const codeEditorModule = vi.hoisted(() => vi.fn());

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

describe("Code workspace ACP task wiring", () => {
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

  it("renders ACP execution and chat handoff as separate actions", () => {
    const markup = renderToStaticMarkup(
      createElement(CodingWorkspaceEditor, {
        acpEditor,
        acpTaskDraft: "Inspect the selected file",
        acpTaskOpen: true,
        draftContent: "",
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
