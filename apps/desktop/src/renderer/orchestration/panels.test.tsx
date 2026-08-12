import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AgentRosterPanel } from "./AgentRosterPanel";
import { PlanPanel } from "./PlanPanel";
import { TaskCreateForm } from "./TaskCreateForm";
import { TASK_QUEUE_PAGE_SIZE, TaskQueuePanel } from "./TaskQueuePanel";

const resource = () => ({ error: "", loading: false, reload: vi.fn() });

describe("orchestration presentational panels", () => {
  it("keeps worker roster selection and health labels", () => {
    const markup = renderToStaticMarkup(
      createElement(AgentRosterPanel, {
        workersResource: resource(),
        workers: [
          {
            id: "worker-1",
            title: "Research worker",
            objective: "Collect evidence",
            status: "running",
            alive: true,
            stalled: false,
            framework: "codex",
          },
        ],
        workerOverview: {
          activeWorkers: 1,
          aliveWorkers: 1,
          stalledWorkers: 0,
        },
        selectedWorker: {
          id: "worker-1",
          title: "Research worker",
          objective: "Collect evidence",
          status: "running",
          alive: true,
          stalled: false,
          framework: "codex",
        },
        onSelectWorker: vi.fn(),
      }),
    );

    expect(markup).toContain("Agent roster");
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("worker alive");
  });

  it("preserves plan approval and steering surfaces", () => {
    const markup = renderToStaticMarkup(
      createElement(PlanPanel, {
        active: true,
        plansResource: resource(),
        plans: [
          {
            id: "plan-1",
            title: "Release plan",
            objective: "Ship the release",
            status: "draft",
            steps: ["Validate", "Ship"],
          },
        ],
        selectedPlan: {
          id: "plan-1",
          title: "Release plan",
          objective: "Ship the release",
          status: "draft",
          steps: ["Validate", "Ship"],
        },
        planCanSteer: false,
        planMetaLines: ["supportsCreate: available"],
        busyKeys: {},
        planSteerInstruction: "",
        onSelectPlan: vi.fn(),
        onApprovePlan: vi.fn(),
        onSteerPlan: vi.fn(),
        onPlanSteerInstructionChange: vi.fn(),
      }),
    );

    expect(markup).toContain("Approve plan");
    expect(markup).toContain("Ready for operator review");
    expect(markup).toContain("Control plane");
  });

  it("keeps coding worktree form labels and routing guidance", () => {
    const markup = renderToStaticMarkup(
      createElement(TaskCreateForm, {
        active: true,
        busy: false,
        title: "Task",
        objective: "Objective",
        capability: "coding",
        framework: "",
        group: "product",
        priority: "normal",
        workspaceRoot: "/work/tree",
        availableWorktrees: [
          { path: "/work/tree", branch: "feature/task", detached: false },
        ],
        accountPoolResource: resource(),
        onTitleChange: vi.fn(),
        onObjectiveChange: vi.fn(),
        onCapabilityChange: vi.fn(),
        onFrameworkChange: vi.fn(),
        onGroupChange: vi.fn(),
        onPriorityChange: vi.fn(),
        onWorkspaceRootChange: vi.fn(),
        onSubmit: vi.fn(),
        onClose: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Task execution worktree"');
    expect(markup).toContain("feature/task");
    expect(markup).toContain(
      "Coding starts only in the selected active Git worktree",
    );
  });

  it("keeps the initial task rail bounded", () => {
    const tasks = Array.from(
      { length: TASK_QUEUE_PAGE_SIZE + 5 },
      (_, index) => ({
        id: `task-${index}`,
        title: `Task ${index}`,
        objective: `Objective ${index}`,
        status: "pending",
      }),
    );
    const markup = renderToStaticMarkup(
      createElement(TaskQueuePanel, {
        active: true,
        projectScope: "all",
        effectiveOverview: { total: tasks.length },
        tasksResource: resource(),
        tasks,
        busyKeys: {},
        selectedTaskNote: "",
        showChildCreate: false,
        childTitle: "",
        childObjective: "",
        childWorkspaceRoot: "",
        worktrees: [],
        confirmedAction: null,
        cascadeChildren: false,
        confirmDialogRef: { current: null },
        onSelectTask: vi.fn(),
        onRunTaskAction: vi.fn(),
        onRequestDestructiveAction: vi.fn(),
        onCloseConfirmation: vi.fn(),
        onCascadeChildrenChange: vi.fn(),
        onToggleChildCreate: vi.fn(),
        onChildTitleChange: vi.fn(),
        onChildObjectiveChange: vi.fn(),
        onChildWorkspaceRootChange: vi.fn(),
        onSubmitSpawn: vi.fn(),
        onTaskNoteChange: vi.fn(),
        onSubmitNote: vi.fn(),
      }),
    );

    expect(markup).toContain("Task 19");
    expect(markup).not.toContain("Task 20");
    expect(markup).toContain("Showing 20 of 25");
    expect(markup).toContain("Show 5 more");
  });
});
