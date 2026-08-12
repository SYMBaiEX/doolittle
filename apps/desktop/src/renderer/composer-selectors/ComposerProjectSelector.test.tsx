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
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search projects"]',
    );
    expect(document.activeElement).toBe(search);
    expect(container.textContent).toContain("Doolittle");
    expect(container.textContent).toContain("Workbench");
    expect(container.textContent).not.toContain("Archived work");

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
      container.querySelector(".composer-project-list")?.textContent,
    ).not.toContain("Doolittle");
    const workbench = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Workbench"),
    );
    act(() => workbench?.click());
    expect(onSelectProject).toHaveBeenCalledWith("project-3");
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    openSelector();
    const general = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("General"),
    );
    act(() => general?.click());
    expect(onSelectProject).toHaveBeenCalledWith("unscoped");
  });

  it("opens repository and project management actions", () => {
    openSelector();
    const addRepository = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add repository"),
    );
    act(() => addRepository?.click());
    expect(onChooseRepository).toHaveBeenCalledTimes(1);

    openSelector();
    const manageProjects = Array.from(
      container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Manage projects");
    act(() => manageProjects?.click());
    expect(onManageProjects).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape and restores trigger focus", () => {
    const trigger = openSelector();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      vi.runAllTimers();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("dismisses when pointer interaction moves outside the popover", () => {
    openSelector();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
