// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLike } from "../project-manager/models";
import { NewConversationControl } from "./ProjectSidebarControls";

const projects: ProjectLike[] = [
  { id: "alpha", name: "Alpha", primaryPath: "/work/alpha" },
  { id: "archived", name: "Archived", archived: true },
];

describe("NewConversationControl", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: { platform: "linux" },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows only active projects and starts in the selected scope", () => {
    const onOpenChange = vi.fn();
    const onStart = vi.fn();
    act(() =>
      root.render(
        <NewConversationControl
          activeScope="alpha"
          isOpen
          onChooseRepository={vi.fn()}
          onManageProjects={vi.fn()}
          onOpenChange={onOpenChange}
          onStart={onStart}
          projects={projects}
          shortcut="Ctrl N"
        />,
      ),
    );

    expect(container.textContent).toContain("Alpha");
    expect(container.textContent).not.toContain("Archived");
    act(() =>
      container
        .querySelector<HTMLButtonElement>("button[data-new-chat-choice]")
        ?.click(),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onStart).toHaveBeenCalledWith("alpha");
  });

  it("filters projects by name and announces an empty result", () => {
    const many = Array.from({ length: 6 }, (_, index) => ({
      id: `project-${index}`,
      name: `Project ${index}`,
    }));
    act(() =>
      root.render(
        <NewConversationControl
          activeScope="unscoped"
          isOpen
          onChooseRepository={vi.fn()}
          onManageProjects={vi.fn()}
          onOpenChange={vi.fn()}
          onStart={vi.fn()}
          projects={many}
          shortcut="Ctrl N"
        />,
      ),
    );
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search projects"]',
    );
    expect(search).not.toBeNull();
    act(() => {
      if (!search) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "missing");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.textContent).toContain("No matching projects.");
  });
});
