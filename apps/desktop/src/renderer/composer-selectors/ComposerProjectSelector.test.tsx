// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLike } from "../project-manager/models";
import { ComposerProjectSelector } from "./ComposerProjectSelector";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const projects: ProjectLike[] = [
  {
    id: "project-1",
    name: "Doolittle",
    pinned: true,
    primaryPath: "/workspace/doolittle",
    updatedAt: "2026-08-12T00:00:00.000Z",
  },
  {
    id: "project-2",
    name: "Archived work",
    archived: true,
    primaryPath: "/workspace/archive",
  },
  {
    id: "project-3",
    name: "Workbench",
    primaryPath: "/workspace/workbench",
  },
];

describe("ComposerProjectSelector", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChooseRepository = vi.fn();
  const onManageProjects = vi.fn();
  const onSelectProject = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onChooseRepository.mockReset();
    onManageProjects.mockReset();
    onSelectProject.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <ComposerProjectSelector
          activeProjectId="project-1"
          onChooseRepository={onChooseRepository}
          onManageProjects={onManageProjects}
          onSelectProject={onSelectProject}
          projects={projects}
        />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function openSelector() {
    const trigger = container.querySelector<HTMLButtonElement>(
      ".composer-project-trigger",
    );
    act(() => trigger?.click());
    act(() => vi.runAllTimers());
    return trigger;
  }

  it("filters active projects and selects project or general scope", () => {
    openSelector();
    const search = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Search projects"]',
    );
    expect(document.activeElement).toBe(search);
    expect(document.body.textContent).toContain("Doolittle");
    expect(document.body.textContent).toContain("Workbench");
    expect(document.body.textContent).not.toContain("Archived work");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      if (!search) return;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(search, "workbench");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      document.body.querySelector(".composer-project-list")?.textContent,
    ).not.toContain("Doolittle");
    const workbench = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Workbench"),
    );
    act(() => workbench?.click());
    expect(onSelectProject).toHaveBeenCalledWith("project-3");
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    openSelector();
    const general = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("General"),
    );
    act(() => general?.click());
    expect(onSelectProject).toHaveBeenCalledWith("unscoped");
  });

  it("opens repository and project management actions", () => {
    openSelector();
    const addRepository = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent?.includes("Add repository"));
    act(() => addRepository?.click());
    expect(onChooseRepository).toHaveBeenCalledTimes(1);

    openSelector();
    const manageProjects = Array.from(
      document.body.querySelectorAll("button"),
    ).find((button) => button.textContent === "Manage projects");
    act(() => manageProjects?.click());
    expect(onManageProjects).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape and restores trigger focus", () => {
    const trigger = openSelector();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      vi.runAllTimers();
    });
    act(() => vi.runAllTimers());
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses when pointer interaction moves outside the popover", () => {
    openSelector();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      document.body.click();
    });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps portaled content interactive without treating it as outside", () => {
    openSelector();
    const input = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Search projects"]',
    );
    act(() =>
      input?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
    );
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const content = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(content?.className).toContain(
      "max-h-[var(--radix-popover-content-available-height)]",
    );
    expect(content?.className).toContain(
      "grid-rows-[auto_auto_minmax(0,1fr)_auto]",
    );
    expect(content?.getAttribute("data-align")).toBe("end");
  });

  it("closes its portal when the source session becomes hidden or inert", async () => {
    openSelector();
    await act(async () => container.setAttribute("inert", ""));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
