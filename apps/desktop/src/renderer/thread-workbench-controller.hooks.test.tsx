// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadWorkbenchRail } from "./components/ThreadWorkbenchRail";
import { useThreadWorkbenchRailController } from "./thread-workbench-controller";

const resources = vi.hoisted(() => ({
  reads: [] as Array<{ path: string | null; botId?: string; origin?: unknown }>,
  reload: vi.fn(),
}));
vi.mock("./lib", async (original) => ({
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
vi.mock("./desktop-acp-client", () => ({
  useDesktopAcpEditorBridge: () => ({}),
}));
vi.mock("./thread-workbench/WorkbenchPanels", () => ({
  WorkbenchPanels: ({
    controller,
    idPrefix,
  }: {
    controller: ReturnType<typeof useThreadWorkbenchRailController>;
    idPrefix: string;
  }) => (
    <section
      role="tabpanel"
      id={`${idPrefix}-${controller.model.selectedTab}-panel`}
      aria-labelledby={`${idPrefix}-${controller.model.selectedTab}-tab`}
    />
  ),
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
    group: "library",
    onInsertContext: vi.fn(),
  };

  beforeEach(() => {
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

  it("keeps selections through group switching, close/reopen and remount", () => {
    render(props);
    act(() => {
      controller.selectTab("changes");
      controller.setSelectedFile("src/a.ts");
      controller.setSelectedChange("src/b.ts");
      controller.setSelectedCommand("command-1");
    });
    render({ ...props, group: "computer" });
    expect(controller.model.selectedTab).toBe("terminal");
    act(() => controller.selectTab("preview"));
    render(props);
    expect(controller.model.selectedTab).toBe("changes");
    resources.reads.length = 0;
    render({ ...props, active: false });
    expect(resources.reads.every((entry) => entry.path === null)).toBe(true);
    expect(controller.selectedChange).toBe("src/b.ts");
    render({ ...props, group: "computer" });
    expect(controller.model.selectedTab).toBe("preview");
    act(() => root.unmount());
    root = createRoot(container);
    render(props);
    expect(controller.model.selectedTab).toBe("changes");
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

  it("preserves roving focus and selected-tab semantics when changing groups", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const renderRail = (group: "library" | "computer") =>
      act(() =>
        root.render(
          <ThreadWorkbenchRail
            {...props}
            group={group}
            minimal
            onRequestClose={vi.fn()}
            onOpenFullView={vi.fn()}
          />,
        ),
      );
    renderRail("library");
    const files = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-label="Files"]',
    );
    files?.focus();
    act(() =>
      files?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      ),
    );
    let selected = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selected?.getAttribute("aria-label")).toBe("Changes");
    expect(document.activeElement).toBe(selected);
    renderRail("computer");
    selected = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selected?.getAttribute("aria-label")).toBe("Terminal");
    act(() =>
      selected?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" }),
      ),
    );
    selected = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selected?.getAttribute("aria-label")).toBe("Settings");
    expect(document.activeElement).toBe(selected);
    renderRail("library");
    selected = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selected?.getAttribute("aria-label")).toBe("Changes");
    expect(
      container.querySelectorAll('[role="tab"][tabindex="0"]'),
    ).toHaveLength(1);
    expect(selected?.getAttribute("aria-controls")).toBe(
      container.querySelector('[role="tabpanel"]')?.id,
    );
  });
});
