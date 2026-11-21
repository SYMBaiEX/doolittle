// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionWorkspace } from "../../apps/desktop/src/renderer/session-workspace/SessionWorkspace";
import {
  MAX_OPEN_PANELS,
  openWorkspaceSession,
  restoreWorkspaceLayout,
  SESSION_WORKSPACE_STORAGE_KEY,
} from "../../apps/desktop/src/renderer/session-workspace/workspace-layout";
import { useThreadWorkbenchRailController } from "../../apps/desktop/src/renderer/thread-workbench-controller";

const resources = vi.hoisted(() => ({
  changes: null as { changes: unknown[] } | null,
  reads: [] as Array<{ path: string | null; botId?: string; origin?: unknown }>,
  reload: vi.fn(),
}));
vi.mock("../../apps/desktop/src/renderer/lib", async (original) => ({
  ...(await original<object>()),
  useApiResource: (
    path: string | null,
    _dependencies: unknown,
    botId?: string,
    origin?: unknown,
  ) => {
    resources.reads.push({ path, botId, origin });
    return {
      data: path === "/repo/changes" ? resources.changes : null,
      loading: false,
      error: "",
      reload: resources.reload,
    };
  },
}));
vi.mock("../../apps/desktop/src/renderer/desktop-acp-client", () => ({
  useDesktopAcpEditorBridge: () => ({}),
}));

type Props = Parameters<typeof useThreadWorkbenchRailController>[0];
let controller: ReturnType<typeof useThreadWorkbenchRailController>;
function Probe(props: Props) {
  controller = useThreadWorkbenchRailController(props);
  return (
    <output>
      {controller.model.selectedTab}:{controller.selectedFile}
    </output>
  );
}

it("opens an opaque group chat at capacity and keeps the previous draft", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  let layout = restoreWorkspaceLayout(null, "previous");
  for (let index = 1; index < MAX_OPEN_PANELS; index++)
    layout = openWorkspaceSession(layout, `session-${index}`);
  window.localStorage.setItem(
    SESSION_WORKSPACE_STORAGE_KEY,
    JSON.stringify(openWorkspaceSession(layout, "previous")),
  );

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelect = vi.fn();
  const props: Omit<ComponentProps<typeof SessionWorkspace>, "selectedId"> = {
    backend: { phase: "ready", message: "" },
    runtime: null,
    remoteSessions: [],
    workspacePath: "/fixture",
    onSelect,
    refreshRuntime: vi.fn(),
    onOpenModelsPage: vi.fn(),
    onOpenProvidersPage: vi.fn(),
    onOpenWorkspaceView: vi.fn(),
    onConsumeContextHandoff: vi.fn(),
    pendingApprovals: 0,
    pendingContextHandoff: null,
    runningTasks: 0,
    chromeHost: null,
    renderPanel: ({ selectedId }) => <textarea aria-label={selectedId} />,
  };
  const render = (selectedId: string) =>
    act(() =>
      root.render(<SessionWorkspace {...props} selectedId={selectedId} />),
    );
  const panel = (id: string) =>
    Array.from(
      container.querySelectorAll<HTMLElement>("[data-session-panel]"),
    ).find((pane) => pane.dataset.sessionPanel === id);

  try {
    render("previous");
    const previous = panel("previous");
    const other = panel("session-1");
    expect(previous?.hidden).toBe(false);
    expect(other).not.toBeNull();
    const draft = previous?.querySelector("textarea");
    if (!draft) throw new Error("Chat composer was not rendered.");
    draft.value = "Unsent draft";

    const groupId = 'telegram:fixture%20bot:"Room [1]"';
    render(groupId);
    expect(panel(groupId)?.hidden).toBe(false);
    expect(panel("previous")).toBe(previous);
    expect(previous?.hidden).toBe(true);
    expect(panel("session-1")).toBe(other);
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(
      MAX_OPEN_PANELS,
    );
    expect(
      container
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.getAttribute("aria-controls"),
    ).toBe(panel(groupId)?.id);
    expect(panel(groupId)?.id).not.toMatch(/\s/u);
    act(() => window.dispatchEvent(new Event("doolittle:find-session")));
    expect(document.activeElement?.id).toBe("session-workspace-search");

    render("previous");
    expect(previous?.hidden).toBe(false);
    expect(previous?.querySelector("textarea")?.value).toBe("Unsent draft");
    expect(onSelect).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
    resources.changes = null;
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

describe("retained resource panel ownership", () => {
  let container: HTMLDivElement;
  let root: Root;
  const props: Props = {
    active: true,
    botId: "bot-a",
    sessionId: "session",
    workspacePath: "/a",
    selectedTab: "files",
    onInsertContext: vi.fn(),
  };

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    resources.reads.length = 0;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });
  const render = (next: Props) => act(() => root.render(<Probe {...next} />));

  it("falls back to a current changed file when the selected diff disappears", () => {
    resources.changes = {
      changes: [{ path: "current.ts" }, { path: "removed.ts" }],
    };
    render({ ...props, selectedTab: "changes" });
    act(() => controller.setSelectedChange("removed.ts"));
    expect(controller.currentChange).toBe("removed.ts");

    resources.reads.length = 0;
    resources.changes = { changes: [{ path: "current.ts" }] };
    render({ ...props, selectedTab: "changes" });
    expect(controller.currentChange).toBe("current.ts");
    expect(
      resources.reads.some(({ path }) => path?.includes("removed.ts")),
    ).toBe(false);
  });

  it("keeps selections through panel switching, close/reopen and remount", () => {
    render(props);
    act(() => {
      controller.setSelectedFile("src/a.ts");
      controller.setSelectedChange("src/b.ts");
      controller.setSelectedCommand("command-1");
    });
    render({ ...props, selectedTab: "preview" });
    expect(controller.model.selectedTab).toBe("preview");
    expect(controller.selectedChange).toBe("src/b.ts");
    resources.reads.length = 0;
    render({ ...props, active: false });
    expect(resources.reads.every((entry) => entry.path === null)).toBe(true);
    expect(controller.selectedChange).toBe("src/b.ts");
    render({ ...props, selectedTab: "preview" });
    expect(controller.model.selectedTab).toBe("preview");
    act(() => root.unmount());
    root = createRoot(container);
    render(props);
    expect(controller.model.selectedTab).toBe("files");
    expect(controller.selectedFile).toBe("src/a.ts");
    expect(controller.selectedChange).toBe("src/b.ts");
    expect(controller.selectedCommand).toBe("command-1");
  });

  it("does not issue a stale file read on workspace/bot changes or accept old setters", () => {
    render(props);
    act(() => controller.setSelectedFile("private-a.ts"));
    const oldSetter = controller.setSelectedFile;
    for (const next of [
      { ...props, workspacePath: "/b" },
      { ...props, botId: "bot-b" },
      { ...props, sessionId: "session-b" },
    ]) {
      resources.reads.length = 0;
      render(next);
      expect(controller.selectedFile).toBe("");
      expect(
        resources.reads.some((entry) => entry.path?.includes("private-a")),
      ).toBe(false);
      expect(resources.reads.every((entry) => entry.botId === next.botId)).toBe(
        true,
      );
      act(() => oldSetter("late-private.ts"));
      expect(controller.selectedFile).toBe("");
    }
    render(props);
    expect(controller.selectedFile).toBe("private-a.ts");
    expect(controller.file.data).toBeNull();
  });
});
