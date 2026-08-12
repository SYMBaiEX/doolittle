import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangesPanel, TerminalPanel } from "./ChangesAndTerminalPanels";
import { FilesPanel } from "./FilesPanel";

let filesProps: Record<string, unknown> = {};
vi.mock("../components/ThreadWorkbenchFilesPanel", () => ({
  ThreadWorkbenchFilesPanel: (props: Record<string, unknown>) => {
    filesProps = props;
    return createElement("div", null, "files");
  },
}));
vi.mock("../components/GitControlPanel", () => ({
  GitControlPanel: () => createElement("div", null, "git"),
}));

const resource = (data: unknown = null) => ({
  data,
  error: "",
  loading: false,
  reload: vi.fn(),
});

describe("extracted workbench panels", () => {
  it("wires file context insertion and editor updates", () => {
    const insert = vi.fn();
    const publish = vi.fn();
    renderToStaticMarkup(
      <FilesPanel
        controller={
          {
            acpEditor: { publishEditorState: publish },
            fileEntries: [],
            file: { data: { content: "hello" } },
            currentFile: "src/a.ts",
            currentFileLanguage: "ts",
            setSelectedFile: vi.fn(),
            tree: [],
            insert,
          } as never
        }
        workspacePath="/work"
      />,
    );
    (filesProps.onInsertFileContext as () => void)();
    (filesProps.onEditorStateChange as (value: unknown) => void)({
      dirty: true,
    });
    expect(insert).toHaveBeenCalledWith(
      "File context added",
      expect.stringContaining("hello"),
    );
    expect(publish).toHaveBeenCalledWith({ dirty: true }, false);
  });

  it("renders change controls and terminal history output insertion affordance", () => {
    const controller = {
      repositorySummary: { isRepository: true },
      branches: resource(),
      changeEntries: [],
      conflicts: resource(),
      remotes: resource(),
      stashes: resource(),
      worktrees: resource(),
      refreshGit: vi.fn(),
      checkpoints: resource({ checkpoints: [], support: { supported: false } }),
      checkpointBusy: false,
      createCheckpoint: vi.fn(),
      checkpointMessage: "",
      restoreCheckpoint: vi.fn(),
      changes: resource(),
      currentChange: "",
      patch: resource(),
      setSelectedChange: vi.fn(),
      insert: vi.fn(),
    };
    expect(
      renderToStaticMarkup(<ChangesPanel controller={controller as never} />),
    ).toContain("Checkpoints");
    const terminal = {
      terminal: resource(),
      commandEntries: [{ id: "1", command: "echo hi", status: "completed" }],
      currentCommand: { command: "echo hi", status: "completed" },
      setSelectedCommand: vi.fn(),
      insert: vi.fn(),
    };
    const markup = renderToStaticMarkup(
      <TerminalPanel controller={terminal as never} />,
    );
    expect(markup).toContain("echo hi");
    expect(markup).toContain("Add output");
  });
});
