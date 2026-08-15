// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceFileTree } from "./WorkspaceFileTree";

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
});
