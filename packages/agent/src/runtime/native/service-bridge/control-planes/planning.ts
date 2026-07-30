import { getNativeServices } from "../runtime";
import { countEntriesWithKey } from "./shared";
import type { NativePlanningControlPlane, RuntimeLike } from "./types";

export function getNativePlanningControlPlane(
  runtime: RuntimeLike,
): NativePlanningControlPlane {
  const { actionPlanning, operatorPlanning } = getNativeServices(runtime);
  const planning = operatorPlanning;
  const rawPlans = planning?.listPlans?.() ?? [];
  const plans = Array.isArray(rawPlans) ? rawPlans : [];
  const linkedTasks = countEntriesWithKey(plans, "taskId");
  const linkedWorkflows = countEntriesWithKey(plans, "workflowId");

  return {
    source: planning ? ("native-plugin" as const) : ("product" as const),
    available: Boolean(planning),
    actionPlanningAvailable: Boolean(actionPlanning),
    capability:
      planning?.capabilityDescription ??
      "Native planning service for execution plans linked to delegation tasks and workflow graphs.",
    plans: {
      total: plans.length,
      linkedTasks,
      linkedWorkflows,
    },
    supportsCreate: typeof planning?.createPlan === "function",
    supportsApprove: typeof planning?.approvePlan === "function",
    supportsSteer: typeof planning?.steerPlan === "function",
    detail: planning
      ? `Doolittle operator planning is live with ${plans.length} plans, ${linkedTasks} linked tasks, and ${linkedWorkflows} linked workflows. Eliza action planning is ${actionPlanning ? "available" : "unavailable"}.`
      : `Doolittle operator planning is unavailable. Eliza action planning is ${actionPlanning ? "available" : "unavailable"}.`,
  };
}
