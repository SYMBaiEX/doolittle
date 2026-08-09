import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { submitAcpEditorTask } from "./coding-workspace/acp-task";
import {
  type CodingWorkspaceAcpViewModel,
  CodingWorkspaceEditor,
} from "./coding-workspace/CodingWorkspaceEditor";

vi.mock("./components/CodeEditor", () => ({
  CodeEditor: () => null,
}));

const acpEditor: CodingWorkspaceAcpViewModel = {
  cancel: vi.fn().mockResolvedValue(undefined),
  error: "",
  lastUpdateLabel: "",
  phase: "connected",
  promptBusy: false,
  promptError: "",
  promptPhase: "idle",
  responseText: "",
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
  });
});
