import type { StoredPlanRecord } from "@doolittle/contracts";
import type { NativeOperatorPlanningService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod, resolveService } from "./resolve";

type Svc = NativeOperatorPlanningService;
const KEY = "operatorPlanning";

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

export async function approveEffectivePlan(
  runtime: RuntimeLike,
  planId: string,
) {
  return resolveMethod<Svc, "approvePlan">(
    runtime,
    KEY,
    "approvePlan",
    "planning service with reviewed-plan approval",
  )(planId);
}

export async function steerEffectivePlan(
  runtime: RuntimeLike,
  planId: string,
  instruction: string,
) {
  return resolveMethod<Svc, "steerPlan">(
    runtime,
    KEY,
    "steerPlan",
    "planning service with operator steering",
  )(planId, instruction);
}
