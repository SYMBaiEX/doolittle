// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlanPanel } from "../../apps/desktop/src/renderer/orchestration/PlanPanel";
import { TaskQueuePanel } from "../../apps/desktop/src/renderer/orchestration/TaskQueuePanel";

const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const noop = () => {};
let previousActEnvironment: boolean | undefined;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

function taskQueueProps() {
  return {
    active: true,
    projectScope: "all",
    effectiveOverview: {},
    tasksResource: { loading: false, error: "", reload: noop },
    tasks: [],
    busyKeys: {},
    selectedTaskNote: "",
    showChildCreate: false,
    childTitle: "",
    childObjective: "",
    childWorkspaceRoot: "",
    worktrees: [],
    confirmedAction: null,
    onSelectTask: noop,
    onRunTaskAction: noop,
    onRunBulkTaskAction: async () => {},
    onRequestDestructiveAction: noop,
    onCloseConfirmation: noop,
    onToggleChildCreate: noop,
    onChildTitleChange: noop,
    onChildObjectiveChange: noop,
    onChildWorkspaceRootChange: noop,
    onSubmitSpawn: noop,
    onTaskNoteChange: noop,
    onSubmitNote: noop,
  } as const;
}

it("offers task creation from the empty queue only when honestly available", () => {
  const onCreateTask = vi.fn();
  act(() =>
    root.render(
      <TaskQueuePanel {...taskQueueProps()} onCreateTask={onCreateTask} />,
    ),
  );
  const action = container.querySelector<HTMLButtonElement>(
    ".workbench-empty__actions button",
  );
  expect(container.textContent).toContain("No tasks yet");
  expect(action?.textContent).toContain("New task");
  act(() => action?.click());
  expect(onCreateTask).toHaveBeenCalledOnce();
});

it("stays factual when task creation is unavailable", () => {
  act(() => root.render(<TaskQueuePanel {...taskQueueProps()} />));
  expect(container.textContent).toContain("No tasks yet");
  expect(container.querySelector(".workbench-empty__actions")).toBeNull();
});

function planPanelProps() {
  return {
    active: true,
    plansResource: { loading: false, error: "", reload: noop },
    plans: [],
    planCanSteer: false,
    planMetaLines: [],
    busyKeys: {},
    planSteerInstruction: "",
    onSelectPlan: noop,
    onApprovePlan: noop,
    onSteerPlan: noop,
    onPlanSteerInstructionChange: noop,
  } as const;
}

it("offers plan creation from the empty plans state when available", () => {
  const onCreatePlan = vi.fn();
  act(() =>
    root.render(
      <PlanPanel {...planPanelProps()} onCreatePlan={onCreatePlan} />,
    ),
  );
  const action = container.querySelector<HTMLButtonElement>(
    ".workbench-empty__actions button",
  );
  expect(container.textContent).toContain("No plans yet");
  expect(action?.textContent).toContain("New plan");
  act(() => action?.click());
  expect(onCreatePlan).toHaveBeenCalledOnce();
});

it("keeps the empty plans state factual when creation is unavailable", () => {
  act(() => root.render(<PlanPanel {...planPanelProps()} />));
  expect(container.textContent).toContain("No plans yet");
  expect(container.querySelector(".workbench-empty__actions")).toBeNull();
});
