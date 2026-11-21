// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceFileTree } from "../../apps/desktop/src/renderer/components/WorkspaceFileTree";
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
