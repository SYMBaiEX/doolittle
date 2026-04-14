import type { StoredFormRecord } from "@doolittle/contracts";
import type { NativeFormsService } from "../runtime-contracts";
import { type RuntimeLike, resolveMethod, resolveService } from "./resolve";

type Svc = NativeFormsService;
const KEY = "forms";

export async function listEffectiveForms(
  runtime: RuntimeLike,
): Promise<StoredFormRecord[]> {
  const forms = resolveService<Svc>(runtime, KEY);
  const formList = forms?.listForms?.() ?? [];
  return Array.isArray(formList) ? (formList as StoredFormRecord[]) : [];
}

export function getEffectiveFormTemplates(runtime: RuntimeLike) {
  const forms = resolveService<Svc>(runtime, KEY);
  const templates = forms?.getTemplates?.();
  if (templates instanceof Map) {
    return [...templates.entries()].map(([id, value]) => ({ id, value }));
  }
  if (Array.isArray(templates)) {
    return templates;
  }
  if (templates && typeof templates === "object") {
    return Object.entries(templates).map(([id, value]) => ({ id, value }));
  }
  return [];
}

export async function createEffectiveForm(
  runtime: RuntimeLike,
  templateOrForm: unknown,
  metadata?: unknown,
) {
  return resolveMethod<Svc, "createForm">(
    runtime,
    KEY,
    "createForm",
    "forms service",
  )(templateOrForm, metadata);
}

export async function getEffectiveForm(runtime: RuntimeLike, formId: string) {
  return resolveMethod<Svc, "getForm">(
    runtime,
    KEY,
    "getForm",
    "forms service",
  )(formId);
}

export async function cancelEffectiveForm(
  runtime: RuntimeLike,
  formId: string,
) {
  return resolveMethod<Svc, "cancelForm">(
    runtime,
    KEY,
    "cancelForm",
    "forms service",
  )(formId);
}
