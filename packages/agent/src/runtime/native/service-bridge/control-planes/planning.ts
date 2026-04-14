import { getNativeServices } from "../runtime";
import { countEntriesWithKey } from "./shared";
import type { NativePlanningControlPlane, RuntimeLike } from "./types";

export function getNativePlanningControlPlane(
  runtime: RuntimeLike,
): NativePlanningControlPlane {
  const planning = getNativeServices(runtime).planning;
  const rawPlans = planning?.listPlans?.() ?? [];
  const plans = Array.isArray(rawPlans) ? rawPlans : [];
  const linkedTasks = countEntriesWithKey(plans, "taskId");
  const linkedWorkflows = countEntriesWithKey(plans, "workflowId");

  return {
    source: planning ? ("native-plugin" as const) : ("product" as const),
    available: Boolean(planning),
    capability:
      planning?.capabilityDescription ??
      "Native planning service for execution plans linked to delegation tasks and workflow graphs.",
    plans: {
      total: plans.length,
      linkedTasks,
      linkedWorkflows,
    },
    supportsCreate: typeof planning?.createPlan === "function",
    detail: planning
      ? `Planning service is live with ${plans.length} plans, ${linkedTasks} linked tasks, and ${linkedWorkflows} linked workflows.`
      : "Planning service is not available in the native runtime.",
  };
}
