// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThreadWorkbenchRailController } from "../../apps/desktop/src/renderer/thread-workbench-controller";

const resources = vi.hoisted(() => ({
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
    return { data: null, loading: false, error: "", reload: resources.reload };
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
