import { describe, expect, it, vi } from "vitest";
import {
  type ReloadableResource,
  refreshCodegenResources,
  refreshOrchestrationResources,
} from "./orchestration-refresh";

function resource(): ReloadableResource {
  return { reload: vi.fn() };
}

describe("orchestration refresh ownership", () => {
  it("reloads each code-generation collection once and skips idle details", () => {
    const resources = {
      runDetail: resource(),
      runs: resource(),
      runtime: resource(),
      selectedRunId: "",
      selectedWorkflowId: "",
      workflowDetail: resource(),
      workflows: resource(),
    };

    refreshCodegenResources(resources);

    expect(resources.runtime.reload).toHaveBeenCalledOnce();
    expect(resources.workflows.reload).toHaveBeenCalledOnce();
    expect(resources.runs.reload).toHaveBeenCalledOnce();
    expect(resources.workflowDetail.reload).not.toHaveBeenCalled();
    expect(resources.runDetail.reload).not.toHaveBeenCalled();
  });

  it("reloads selected details and every collection in a full refresh", () => {
    const resources = {
      accountPool: resource(),
      overview: resource(),
      plans: resource(),
      runDetail: resource(),
      runs: resource(),
      runtime: resource(),
      selectedRunId: "run-1",
      selectedWorkflowId: "workflow-1",
      tasks: resource(),
      workers: resource(),
      workflowDetail: resource(),
      workflows: resource(),
      worktrees: resource(),
    };

    refreshOrchestrationResources(resources);

    for (const [key, value] of Object.entries(resources)) {
      if (typeof value === "string") continue;
      expect(value.reload, key).toHaveBeenCalledOnce();
    }
  });
});
