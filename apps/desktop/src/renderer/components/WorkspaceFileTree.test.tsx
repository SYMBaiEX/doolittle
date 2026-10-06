// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceFileTree } from "./WorkspaceFileTree";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceFileTree", () => {
  it("expands folders, opens files, and keeps selected state accessible", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onOpenFile = vi.fn();

    act(() => {
      root.render(
        <WorkspaceFileTree
          entries={[
            { path: "src", type: "directory", depth: 0 },
            { path: "src/index.ts", type: "file", depth: 1 },
            { path: "README.md", type: "file", depth: 0 },
          ]}
          onOpenFile={onOpenFile}
          selectedPath="README.md"
          truncated
        />,
      );
    });

    const tree = host.querySelector('[role="tree"]');
    const source = tree?.querySelector<HTMLButtonElement>('[title="src"]');
    const readme = tree?.querySelector<HTMLButtonElement>(
      '[title="README.md"]',
    );
    expect(source?.getAttribute("aria-expanded")).toBe("false");
    expect(readme?.getAttribute("aria-selected")).toBe("true");
    expect(host.textContent).toContain("limited view");

    act(() => source?.click());
    const index = tree?.querySelector<HTMLButtonElement>(
      '[title="src/index.ts"]',
    );
    expect(source?.getAttribute("aria-expanded")).toBe("true");
    expect(index?.style.paddingInlineStart).toBe("18px");

    act(() => index?.click());
    expect(onOpenFile).toHaveBeenCalledWith("src/index.ts");

    act(() => root.unmount());
    host.remove();
  });

  it("uses real folder/file actions and copies only the selected path", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onOpenFile = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const open = async (path: string) => {
      const row = host.querySelector<HTMLButtonElement>(`[title="${path}"]`);
      expect(row).not.toBeNull();
      await act(async () =>
        row?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
          }),
        ),
      );
    };
    const choose = async (label: string) => {
      const action = [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ].find((item) => item.textContent === label);
      expect(action).toBeDefined();
      await act(async () => action?.click());
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    };
    try {
      await act(async () =>
        root.render(
          <WorkspaceFileTree
            entries={[
              { path: "src", type: "directory", depth: 0 },
              { path: "src/index.ts", type: "file", depth: 1 },
            ]}
            onOpenFile={onOpenFile}
            selectedPath=""
          />,
        ),
      );
      await open("src");
      expect(document.body.querySelectorAll('[role="menu"]')).toHaveLength(1);
      await choose("Expand folder");
      expect(host.querySelector('[title="src/index.ts"]')).not.toBeNull();
      await open("src/index.ts");
      expect(
        document.body.querySelector('[role="menu"]')?.textContent,
      ).not.toMatch(/Rename|Delete|Create/u);
      await choose("Copy relative path");
      expect(writeText).toHaveBeenCalledWith("src/index.ts");
      await open("src/index.ts");
      await choose("Open file");
      expect(onOpenFile).toHaveBeenCalledWith("src/index.ts");
      await open("src");
      await choose("Collapse folder");
      expect(host.querySelector('[title="src/index.ts"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    }
  });

  it("closes a file menu when the immutable resource scope changes", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const entries = [{ path: "README.md", type: "file" as const, depth: 0 }];
    const onOpenFile = vi.fn();
    try {
      await act(async () =>
        root.render(
          <WorkspaceFileTree
            entries={entries}
            onOpenFile={onOpenFile}
            selectedPath=""
            contextScope="bot-a:workspace-a"
          />,
        ),
      );
      await act(async () =>
        host.querySelector('[title="README.md"]')?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
          }),
        ),
      );
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
      await act(async () =>
        root.render(
          <WorkspaceFileTree
            entries={entries}
            onOpenFile={onOpenFile}
            selectedPath=""
            contextScope="bot-b:workspace-b"
          />,
        ),
      );
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(onOpenFile).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
