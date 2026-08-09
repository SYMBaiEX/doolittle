import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CodeEditorStateSnapshot } from "./CodeEditor";
import {
  ThreadWorkbenchFilesPanel,
  type ThreadWorkbenchFilesPanelProps,
} from "./ThreadWorkbenchFilesPanel";

vi.mock("./CodeEditor", async () => {
  const { createElement } = await import("react");
  return {
    CodeEditor: ({ ariaLabel, path }: { ariaLabel?: string; path: string }) =>
      createElement("div", {
        "aria-label": ariaLabel,
        "data-code-editor-path": path,
      }),
  };
});

function props(
  overrides: Partial<ThreadWorkbenchFilesPanelProps> = {},
): ThreadWorkbenchFilesPanelProps {
  return {
    workspacePath: "/work/doolittle",
    tree: {
      data: { entries: [] },
      error: "",
      loading: false,
      reload: vi.fn(),
    },
    file: {
      data: null,
      error: "",
      loading: false,
      reload: vi.fn(),
    },
    entries: [],
    selectedPath: "",
    selectedLanguage: { id: "plaintext", label: "Plain Text" },
    onSelectPath: vi.fn(),
    onInsertFileContext: vi.fn(),
    onEditorStateChange: vi.fn<(snapshot: CodeEditorStateSnapshot) => void>(),
    ...overrides,
  };
}

function render(overrides: Partial<ThreadWorkbenchFilesPanelProps> = {}) {
  return renderToStaticMarkup(
    createElement(ThreadWorkbenchFilesPanel, props(overrides)),
  );
}

describe("ThreadWorkbenchFilesPanel", () => {
  it("renders the Files wrapper and loading state", () => {
    const markup = render({
      tree: {
        data: null,
        error: "",
        loading: true,
        reload: vi.fn(),
      },
    });

    expect(markup).toContain(
      "thread-workbench-panel-body thread-workbench-panel-body--files",
    );
    expect(markup).toContain("Loading workbench…");
    expect(markup).toContain('role="status"');
  });

  it("renders tree errors with the retry affordance", () => {
    const markup = render({
      tree: {
        data: null,
        error: "Cannot read workspace tree",
        loading: false,
        reload: vi.fn(),
      },
    });

    expect(markup).toContain("Could not load this view.");
    expect(markup).toContain("Cannot read workspace tree");
    expect(markup).toContain("Try again");
  });

  it("renders the empty workspace and selected-file empty state", () => {
    const markup = render();

    expect(markup).toContain("thread-workbench-file-workspace");
    expect(markup).toContain("No files returned for this workspace.");
    expect(markup).toContain("thread-workbench-file-empty");
    expect(markup).toContain("Select a file");
  });

  it("renders a selected preview with language, editor ARIA, and enabled insertion", () => {
    const markup = render({
      entries: [{ path: "src/index.ts", type: "file", depth: 1 }],
      file: {
        data: { content: "export {};" },
        error: "",
        loading: false,
        reload: vi.fn(),
      },
      selectedLanguage: { id: "typescript", label: "TypeScript" },
      selectedPath: "src/index.ts",
    });

    expect(markup).toContain('role="tree"');
    expect(markup).toContain("src/index.ts");
    expect(markup).toContain("TypeScript");
    expect(markup).toContain('aria-label="Preview src/index.ts"');
    expect(markup).toContain('data-code-editor-path="src/index.ts"');
    expect(markup).toMatch(/<button type="button">Add to chat<\/button>/u);
  });

  it("disables insertion until selected file content is available", () => {
    const markup = render({ selectedPath: "src/index.ts" });

    expect(markup).toMatch(
      /<button disabled="" type="button">Add to chat<\/button>/u,
    );
  });
});
