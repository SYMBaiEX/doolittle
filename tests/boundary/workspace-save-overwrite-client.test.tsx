// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { CodingWorkspacePage } from "../../apps/desktop/src/renderer/CodingWorkspacePage";

vi.mock("../../apps/desktop/src/renderer/BrowserPage", () => ({
  BrowserPage: () => null,
}));

vi.mock("../../apps/desktop/src/renderer/workspace-resources", () => {
  const resource = (data: unknown) => ({
    data,
    error: "",
    errorDetail: "",
    loading: false,
    reload: vi.fn().mockResolvedValue(undefined),
    status: "ready",
    isValidating: false,
    hasData: data !== null,
  });
  const empty = resource(null);
  return {
    publishWorkspaceFileSave: vi.fn().mockResolvedValue(undefined),
    refreshWorkspaceResources: vi.fn().mockResolvedValue(undefined),
    useRepositoryPatch: () => empty,
    useRepositoryResources: () => ({
      changes: empty,
      branches: empty,
      conflicts: empty,
      remotes: empty,
      stashes: empty,
      worktrees: empty,
    }),
    useWorkspaceResource: (path: string | null) => {
      if (!path) return empty;
      if (path.startsWith("/workspace/read?")) {
        return resource({ path: "note.txt", content: "opened version" });
      }
      if (path === "/workspace/tree?depth=12") {
        return resource({
          entries: [{ path: "note.txt", type: "file", depth: 0 }],
          truncated: false,
        });
      }
      return resource({});
    },
    workspaceMutationRequest: <T extends object>(request: T) => request,
    workspaceResourceOrigin: () => undefined,
  };
});

vi.mock(
  "../../apps/desktop/src/renderer/coding-workspace/CodingWorkspaceExplorer",
  () => ({ CodingWorkspaceExplorer: () => null }),
);

vi.mock(
  "../../apps/desktop/src/renderer/coding-workspace/CodingWorkspaceHeader",
  () => ({ CodingWorkspaceHeader: () => null }),
);

vi.mock(
  "../../apps/desktop/src/renderer/coding-workspace/CodingWorkspaceUtility",
  () => ({ CodingWorkspaceUtility: () => null }),
);

vi.mock("../../apps/desktop/src/renderer/desktop-acp-client", () => ({
  useDesktopAcpEditorBridge: () => ({
    cancel: vi.fn().mockResolvedValue(undefined),
    error: "",
    flushEditorState: vi.fn().mockResolvedValue(undefined),
    lastUpdateLabel: "",
    phase: "idle",
    prompt: vi.fn().mockResolvedValue(undefined),
    promptBusy: false,
    promptError: "",
    promptPhase: "idle",
    publishEditorState: vi.fn(),
    responseText: "",
    retryConnection: vi.fn().mockResolvedValue(undefined),
    sessionId: "",
    stopReason: "",
    updates: [],
  }),
}));

vi.mock("../../apps/desktop/src/renderer/components/CodeEditor", () => ({
  CodeEditor: ({
    disabled,
    onChange,
    value,
  }: {
    disabled?: boolean;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <textarea
      aria-label="Editor text"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  ),
}));

function jsonReply(body: unknown, status = 200) {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    status,
    statusText: "",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("sends overwrite only after the explicit conflict action for a deleted workspace file", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const origin = {
    botId: "writer-bot",
    originConversationId: "writer-chat",
    workspacePath: "/project",
  };
  const requestAgent = vi.fn(() =>
    Promise.resolve(jsonReply({ error: "Path not found: note.txt" }, 404)),
  );
  const saveWorkspaceFile = vi
    .fn()
    .mockResolvedValueOnce({
      status: "conflict",
      message: "File changed after it was opened.",
    })
    .mockResolvedValueOnce({ status: "saved", path: "/project/note.txt" });
  vi.stubGlobal("doolittle", {
    cancelAgentRequest: vi.fn().mockResolvedValue(undefined),
    requestAgent,
    saveWorkspaceFile,
  });

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        <CodingWorkspacePage
          active
          visible
          canCreateWorktree={false}
          editingLocked={false}
          navigationIntent={null}
          onAcknowledgeNavigationIntent={() => undefined}
          onChooseWorkspace={async () => ({
            canceled: true,
            state: { currentPath: "", recentPaths: [] },
          })}
          onOpenWorkspacePath={async () => ({
            canceled: true,
            state: { currentPath: "", recentPaths: [] },
          })}
          onOpenChatTerminal={() => undefined}
          onSendToChat={async () => false}
          previewEvidenceAvailable={false}
          focusState={{
            leftPane: "files",
            editorPane: "file",
            utilityPane: "source-control",
            selectedPath: "note.txt",
            openDocumentPaths: ["note.txt"],
            searchDraft: "",
            searchQuery: "",
            acpTaskOpen: false,
            acpTaskDraft: "",
          }}
          projectScope="unscoped"
          surface="workspace"
          onSurfaceChange={() => undefined}
          origin={origin}
        />,
      );
      await vi.dynamicImportSettled();
    });

    const editor = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Editor text"]',
    );
    expect(editor?.value).toBe("opened version");
    if (!editor) throw new Error("The mocked editor did not mount.");

    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(editor, "user work");
      editor.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const save = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Save file"]',
    );
    expect(save?.disabled).toBe(false);
    await act(async () => {
      save?.click();
      await vi.waitFor(() =>
        expect(saveWorkspaceFile).toHaveBeenCalledTimes(1),
      );
    });
    const plainSave = saveWorkspaceFile.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(plainSave).toMatchObject({
      path: "note.txt",
      content: "user work",
      expectedContent: "opened version",
    });
    expect(plainSave).not.toHaveProperty("overwrite");
    expect(requestAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/workspace/read?path=note.txt",
      }),
    );

    await act(async () => {
      await vi.waitFor(() => {
        const overwrite = Array.from(host.querySelectorAll("button")).find(
          (button) => button.textContent === "Overwrite workspace copy",
        );
        expect(overwrite).toBeDefined();
      });
    });
    const overwrite = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Overwrite workspace copy",
    );
    if (!overwrite)
      throw new Error("The overwrite conflict action is missing.");
    await act(async () => {
      overwrite.click();
      await vi.waitFor(() =>
        expect(saveWorkspaceFile).toHaveBeenCalledTimes(2),
      );
    });
    const explicitOverwrite = saveWorkspaceFile.mock.calls[1]?.[0];
    expect(explicitOverwrite).toMatchObject({
      path: "note.txt",
      content: "user work",
      expectedContent: "opened version",
      overwrite: true,
    });
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
