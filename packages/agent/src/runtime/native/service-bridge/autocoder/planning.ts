import type { StoredPlanRecord } from "@doolittle/contracts";
import type { NativePlanningService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod, resolveService } from "./resolve";

type Svc = NativePlanningService;
const KEY = "planning";

export async function listEffectivePlans(
  runtime: RuntimeLike,
): Promise<StoredPlanRecord[]> {
  const planning = resolveService<Svc>(runtime, KEY);
  const plans = planning?.listPlans?.() ?? [];
  return Array.isArray(plans) ? (plans as StoredPlanRecord[]) : [];
}

export async function createEffectivePlan(
  runtime: RuntimeLike,
  input: unknown,
) {
  return resolveMethod<Svc, "createPlan">(
    runtime,
    KEY,
    "createPlan",
    "planning service",
  )(input);
}

export async function getEffectivePlan(runtime: RuntimeLike, planId: string) {
  return resolveMethod<Svc, "getPlan">(
    runtime,
    KEY,
    "getPlan",
    "planning service",
  )(planId);
}
