// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskQueueDetail, type TaskQueueDetailProps } from "./TaskQueueDetail";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("TaskQueueDetail", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function props(
    overrides: Partial<TaskQueueDetailProps> = {},
  ): TaskQueueDetailProps {
    return {
      active: true,
      busyKeys: {},
      childObjective: "",
      childTitle: "",
      childWorkspaceRoot: "",
      confirmDialogRef: { current: null },
      confirmedAction: null,
      onChildObjectiveChange: vi.fn(),
      onChildTitleChange: vi.fn(),
      onChildWorkspaceRootChange: vi.fn(),
      onCloseConfirmation: vi.fn(),
      onRequestDestructiveAction: vi.fn(),
      onRunTaskAction: vi.fn(),
      onSubmitNote: vi.fn(),
      onSubmitSpawn: vi.fn(),
      onTaskNoteChange: vi.fn(),
      onToggleChildCreate: vi.fn(),
      selectedTask: {
        id: "task-1",
        title: "Verify compact controls",
        objective: "Keep destructive actions discoverable and confirmed.",
        status: "running",
      },
      taskDetailReady: true,
      selectedTaskNote: "",
      showChildCreate: false,
      worktrees: [],
      ...overrides,
    };
  }

  it("keeps destructive controls in a keyboard-operable disclosure", () => {
    const onRequestDestructiveAction = vi.fn();
    act(() =>
      root.render(
        <TaskQueueDetail {...props({ onRequestDestructiveAction })} />,
      ),
    );

    const disclosure = container.querySelector<HTMLDetailsElement>(
      ".orchestration-action-overflow",
    );
    const summary = disclosure?.querySelector("summary");
    expect(summary?.textContent).toContain("More actions");

    act(() => summary?.click());
    expect(disclosure?.open).toBe(true);

    const failButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Mark failed",
    );
    expect(failButton).toBeInstanceOf(HTMLButtonElement);
    act(() => failButton?.click());
    expect(onRequestDestructiveAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-1" }),
      "fail",
      failButton,
    );
  });

  it("does not offer the unsupported manual running transition", () => {
    act(() => root.render(<TaskQueueDetail {...props()} />));

    expect(container.textContent).toContain("Execute");
    expect(container.textContent).toContain("Complete");
    expect(container.textContent).not.toContain("Mark running");
  });

  it("states the official single-task lifecycle boundary truthfully", () => {
    act(() =>
      root.render(
        <TaskQueueDetail
          {...props({
            confirmedAction: { taskId: "task-1", action: "fail" },
          })}
        />,
      ),
    );

    expect(container.textContent).toContain("Child tasks are unchanged");
    expect(container.textContent).not.toContain("Cascade to children");
  });
});
