import type { StoredFormRecord, StoredPlanRecord } from "@doolittle/contracts";
import { getNativeServices, type RuntimeLike } from "../runtime";

interface NativeCodeGenerationService {
  performResearch?: (...args: unknown[]) => unknown;
  generatePRD?: (...args: unknown[]) => unknown;
  performQA?: (...args: unknown[]) => unknown;
  generateCode?: (...args: unknown[]) => unknown;
}

interface NativeGitHubService {
  createRepository?: (name: string, isPrivate?: boolean) => Promise<unknown>;
  deleteRepository?: (name: string) => Promise<unknown>;
}

interface NativeSecretsManagerService {
  getSecret?: (key: string) => Promise<unknown> | unknown;
  setSecret?: (key: string, value: string) => Promise<unknown> | unknown;
  hasSecret?: (key: string) => Promise<boolean> | boolean;
  listSecretKeys?: () => Promise<string[]> | string[];
}

interface NativeFormsService {
  listForms?: () => StoredFormRecord[];
  getTemplates?: () => Map<string, object> | object[] | Record<string, object>;
  createForm?: (
    templateOrForm: unknown,
    metadata?: unknown,
  ) => Promise<StoredFormRecord>;
  getForm?: (formId: string) => Promise<StoredFormRecord | undefined>;
  cancelForm?: (formId: string) => Promise<boolean>;
}

interface NativePlanningService {
  listPlans?: () => StoredPlanRecord[];
  getPlan?: (
    planId: string,
  ) => Promise<StoredPlanRecord | undefined> | StoredPlanRecord | undefined;
  createPlan?: (input: unknown) => Promise<StoredPlanRecord> | StoredPlanRecord;
}

interface NativeE2BService {
  listSandboxes?: () => Array<{
    id?: string;
    path?: string;
    template?: string;
    metadata?: Record<string, string>;
    createdAt?: string;
  }>;
  createSandbox?: (options?: {
    template?: string;
    metadata?: Record<string, string>;
  }) => Promise<string>;
  killSandbox?: (id?: string) => Promise<void>;
  executeCode?: (code: string, language?: string) => Promise<unknown>;
}

export async function performEffectiveCodeResearch(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration as
    | NativeCodeGenerationService
    | undefined;
  if (!codeGeneration?.performResearch) {
    throw new Error("Native code generation research is unavailable.");
  }
  return codeGeneration.performResearch(request);
}

export async function generateEffectivePrd(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
  research: Record<string, unknown>,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration as
    | NativeCodeGenerationService
    | undefined;
  if (!codeGeneration?.generatePRD) {
    throw new Error("Native PRD generation is unavailable.");
  }
  return codeGeneration.generatePRD(request, research);
}

export async function performEffectiveCodeQa(
  runtime: RuntimeLike,
  projectPath: string,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration as
    | NativeCodeGenerationService
    | undefined;
  if (!codeGeneration?.performQA) {
    throw new Error("Native code generation QA is unavailable.");
  }
  return codeGeneration.performQA(projectPath);
}

export async function createEffectiveRepository(
  runtime: RuntimeLike,
  name: string,
  isPrivate = true,
) {
  const github = getNativeServices(runtime).github as
    | NativeGitHubService
    | undefined;
  if (!github?.createRepository) {
    throw new Error("Native GitHub service is unavailable.");
  }
  return github.createRepository(name, isPrivate);
}

export async function deleteEffectiveRepository(
  runtime: RuntimeLike,
  name: string,
) {
  const github = getNativeServices(runtime).github as
    | NativeGitHubService
    | undefined;
  if (!github?.deleteRepository) {
    throw new Error("Native GitHub service is unavailable.");
  }
  return github.deleteRepository(name);
}

export async function getEffectiveSecret(runtime: RuntimeLike, key: string) {
  const secretsManager = getNativeServices(runtime).secretsManager as
    | NativeSecretsManagerService
    | undefined;
  if (!secretsManager?.getSecret) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.getSecret(key);
}

export async function setEffectiveSecret(
  runtime: RuntimeLike,
  key: string,
  value: string,
) {
  const secretsManager = getNativeServices(runtime).secretsManager as
    | NativeSecretsManagerService
    | undefined;
  if (!secretsManager?.setSecret) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.setSecret(key, value);
}

export async function hasEffectiveSecret(runtime: RuntimeLike, key: string) {
  const secretsManager = getNativeServices(runtime).secretsManager as
    | NativeSecretsManagerService
    | undefined;
  if (!secretsManager?.hasSecret) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.hasSecret(key);
}

export async function listEffectiveSecretKeys(runtime: RuntimeLike) {
  const secretsManager = getNativeServices(runtime).secretsManager as
    | NativeSecretsManagerService
    | undefined;
  if (!secretsManager?.listSecretKeys) {
    throw new Error("Native secrets service is unavailable.");
  }
  return secretsManager.listSecretKeys();
}

export async function listEffectiveForms(
  runtime: RuntimeLike,
): Promise<StoredFormRecord[]> {
  const forms = getNativeServices(runtime).forms as
    | NativeFormsService
    | undefined;
  const formList = forms?.listForms?.() ?? [];
  return Array.isArray(formList) ? formList : [];
}

export async function listEffectivePlans(
  runtime: RuntimeLike,
): Promise<StoredPlanRecord[]> {
  const planning = getNativeServices(runtime).planning as
    | NativePlanningService
    | undefined;
  const plans = planning?.listPlans?.() ?? [];
  return Array.isArray(plans) ? plans : [];
}

export function getEffectiveFormTemplates(runtime: RuntimeLike) {
  const forms = getNativeServices(runtime).forms as
    | NativeFormsService
    | undefined;
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
  const forms = getNativeServices(runtime).forms as
    | NativeFormsService
    | undefined;
  if (!forms?.createForm) {
    throw new Error("Native forms service is unavailable.");
  }
  return forms.createForm(templateOrForm, metadata);
}

export async function createEffectivePlan(
  runtime: RuntimeLike,
  input: unknown,
) {
  const planning = getNativeServices(runtime).planning as
    | NativePlanningService
    | undefined;
  if (!planning?.createPlan) {
    throw new Error("Native planning service is unavailable.");
  }
  return planning.createPlan(input);
}

export async function getEffectiveForm(runtime: RuntimeLike, formId: string) {
  const forms = getNativeServices(runtime).forms as
    | NativeFormsService
    | undefined;
  if (!forms?.getForm) {
    throw new Error("Native forms service is unavailable.");
  }
  return forms.getForm(formId);
}

export async function getEffectivePlan(runtime: RuntimeLike, planId: string) {
  const planning = getNativeServices(runtime).planning as
    | NativePlanningService
    | undefined;
  if (!planning?.getPlan) {
    throw new Error("Native planning service is unavailable.");
  }
  return planning.getPlan(planId);
}

export async function cancelEffectiveForm(
  runtime: RuntimeLike,
  formId: string,
) {
  const forms = getNativeServices(runtime).forms as
    | NativeFormsService
    | undefined;
  if (!forms?.cancelForm) {
    throw new Error("Native forms service is unavailable.");
  }
  return forms.cancelForm(formId);
}

export function listEffectiveSandboxes(runtime: RuntimeLike) {
  const e2b = getNativeServices(runtime).e2b as NativeE2BService | undefined;
  return e2b?.listSandboxes?.() ?? [];
}

export async function createEffectiveSandbox(
  runtime: RuntimeLike,
  options?: {
    template?: string;
    metadata?: Record<string, string>;
  },
) {
  const e2b = getNativeServices(runtime).e2b as NativeE2BService | undefined;
  if (!e2b?.createSandbox) {
    throw new Error("Native E2B service is unavailable.");
  }
  return e2b.createSandbox(options);
}

export async function killEffectiveSandbox(runtime: RuntimeLike, id?: string) {
  const e2b = getNativeServices(runtime).e2b as NativeE2BService | undefined;
  if (!e2b?.killSandbox) {
    throw new Error("Native E2B service is unavailable.");
  }
  return e2b.killSandbox(id);
}

export async function executeEffectiveSandboxCode(
  runtime: RuntimeLike,
  code: string,
  language = "python",
) {
  const e2b = getNativeServices(runtime).e2b as NativeE2BService | undefined;
  if (!e2b?.executeCode) {
    throw new Error("Native E2B service is unavailable.");
  }
  return e2b.executeCode(code, language);
}

export async function generateEffectiveCode(
  runtime: RuntimeLike,
  request: Record<string, unknown>,
) {
  const codeGeneration = getNativeServices(runtime).codeGeneration as
    | NativeCodeGenerationService
    | undefined;
  if (!codeGeneration?.generateCode) {
    throw new Error("Native code generation service is unavailable.");
  }
  return codeGeneration.generateCode(request);
}
