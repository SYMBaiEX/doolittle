import { describe, expect, it } from "vitest";
import { apiResourceCacheKey } from "./lib";
import {
  isolatedCodingWorktrees,
  normalizeOrchestrationResources,
  ORCHESTRATION_TASK_SUMMARY_LIMIT,
  orchestrationResourceDependencies,
  orchestrationResourceId,
  orchestrationResourcePaths,
  projectOrchestrationCodegenSelection,
} from "./orchestration-resources";

describe("orchestration resource paths", () => {
  it("uses bounded collection endpoints and safely encodes selected resource IDs", () => {
    expect(orchestrationResourcePaths.overview).toBe(
      "/delegation/overview-snapshot",
    );
    expect(orchestrationResourcePaths.tasks).toBe(
      `/delegation/task-summaries?limit=${ORCHESTRATION_TASK_SUMMARY_LIMIT}`,
    );
    expect(orchestrationResourcePaths.workers).toBe(
      "/delegation/workers?limit=100",
    );
    expect(orchestrationResourcePaths.workflow("workflow/a ?")).toBe(
      "/codegen/workflows/workflow%2Fa%20%3F",
    );
    expect(orchestrationResourcePaths.run("run/a ?")).toBe(
      "/codegen/runs/run%2Fa%20%3F",
    );
    expect(orchestrationResourcePaths.task("task/a ?")).toBe(
      "/delegation/tasks/task%2Fa%20%3F",
    );
    expect(orchestrationResourceId("task/a ?")).toBe("task%2Fa%20%3F");
  });
});

describe("orchestration resource cache identity", () => {
  const path = orchestrationResourcePaths.tasks;

  it("separates task cache records when workspace or project scope changes", () => {
    const forProjectA = orchestrationResourceDependencies({
      enabled: true,
      scope: "workspace-project",
      projectScope: "project-a",
      workspacePath: "/work/a",
    });
    const forProjectB = orchestrationResourceDependencies({
      enabled: true,
      scope: "workspace-project",
      projectScope: "project-b",
      workspacePath: "/work/b",
    });

    expect(apiResourceCacheKey(path, forProjectA)).not.toBe(
      apiResourceCacheKey(path, forProjectB),
    );
  });

  it("keeps globally scoped resources independent of workspace and project", () => {
    const forProjectA = orchestrationResourceDependencies({
      enabled: true,
      scope: "global",
      projectScope: "project-a",
      workspacePath: "/work/a",
    });
    const forProjectB = orchestrationResourceDependencies({
      enabled: true,
      scope: "global",
      projectScope: "project-b",
      workspacePath: "/work/b",
    });

    expect(
      apiResourceCacheKey(orchestrationResourcePaths.overview, forProjectA),
    ).toBe(
      apiResourceCacheKey(orchestrationResourcePaths.overview, forProjectB),
    );
  });
});

describe("normalizeOrchestrationResources", () => {
  it("keeps record-shaped entries and removes invalid or prunable worktrees", () => {
    const resources = normalizeOrchestrationResources({
      tasks: [{ id: "task-1", title: "Task", objective: "Do it" }, null],
      workers: [{ id: "worker-1" }, "not-a-worker"],
      worktrees: [
        { path: "/repo/main", branch: "main" },
        { path: "/repo/prunable", prunable: true },
        { branch: "missing-path" },
      ],
      plans: [{ id: "plan-1" }],
      workflows: [{ id: "workflow-1" }],
      runs: [{ id: "run-1" }],
      workflowDetailRuns: [{ id: "detail-run-1" }],
    });

    expect(resources.tasks).toHaveLength(1);
    expect(resources.workers).toHaveLength(1);
    expect(resources.worktrees).toEqual([
      { path: "/repo/main", branch: "main" },
    ]);
    expect(resources.plans[0]?.id).toBe("plan-1");
    expect(resources.workflows[0]?.id).toBe("workflow-1");
    expect(resources.runs[0]?.id).toBe("run-1");
    expect(resources.workflowDetailRuns[0]?.id).toBe("detail-run-1");
  });
});

describe("isolatedCodingWorktrees", () => {
  it("excludes the primary, detached, and branchless worktrees", () => {
    expect(
      isolatedCodingWorktrees(
        [
          { path: "/repo", branch: "main" },
          { path: "/repo/feature", branch: "feature/guided" },
          { path: "/repo/detached", branch: "feature/old", detached: true },
          { path: "/repo/no-branch" },
        ],
        "/repo",
        "darwin",
      ),
    ).toEqual([{ path: "/repo/feature", branch: "feature/guided" }]);
  });
});

describe("projectOrchestrationCodegenSelection", () => {
  it("does not project stale workflow detail and clears a stale run selection", () => {
    const stale = projectOrchestrationCodegenSelection({
      workflows: [{ id: "workflow-a" }],
      globalRuns: [{ id: "global-run" }],
      workflowDetailRuns: [{ id: "run-a" }],
      selectedWorkflowId: "workflow-a",
      selectedRunId: "run-a",
      detailWorkflowId: "workflow-b",
      workflowDetailLoading: false,
    });
    const empty = projectOrchestrationCodegenSelection({
      workflows: [{ id: "workflow-a" }],
      globalRuns: [],
      workflowDetailRuns: [],
      selectedWorkflowId: "workflow-a",
      selectedRunId: "run-a",
      detailWorkflowId: "workflow-a",
      workflowDetailLoading: false,
    });

    expect(stale.visibleRuns).toEqual([]);
    expect(stale.selectedRun).toBeUndefined();
    expect(stale.selectedRunIdUpdate).toBeUndefined();
    expect(empty.selectedRunIdUpdate).toBe("");
  });
});
