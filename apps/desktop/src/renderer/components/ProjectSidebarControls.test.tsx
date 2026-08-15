// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLike } from "../project-manager/models";
import {
  floatingProjectMenuPosition,
  NewConversationControl,
} from "./ProjectSidebarControls";

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

  it("keeps the floating menu inside the viewport", () => {
    expect(
      floatingProjectMenuPosition(
        { bottom: 76, left: 238, top: 38 },
        { height: 620, width: 320 },
      ),
    ).toMatchObject({ left: 16, top: 83, width: 288 });
    expect(
      floatingProjectMenuPosition(
        { bottom: 598, left: 18, top: 560 },
        { height: 620, width: 900 },
        420,
      ),
    ).toMatchObject({ left: 18, top: 133, width: 330 });
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

    expect(document.body.textContent).toContain("Alpha");
    expect(document.body.textContent).not.toContain("Archived");
    act(() =>
      document.body
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
    const search = document.body.querySelector<HTMLInputElement>(
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
    expect(document.body.textContent).toContain("No matching projects.");
  });
});
