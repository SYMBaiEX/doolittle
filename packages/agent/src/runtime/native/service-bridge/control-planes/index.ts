import type { StoredFormRecord, StoredPlanRecord } from "@doolittle/contracts";
import { benchmarkConfig } from "@elizaos/plugin-action-bench";

export {
  type BrowserMcpServices,
  getNativeIntegrationControlPlane,
  type NativeIntegrationControlPlane,
} from "../integration-control";

import { getNativeExecutionControlPlaneDetails } from "../native-execution-control-plane";
import { getNativeServices, type RuntimeLike } from "../runtime";

export {
  getNativeE2BSandboxControlPlane,
  type NativeE2BService,
} from "../execution-control-plane";
export { getNativeMediaControlPlane } from "../media-control";
export type {
  EffectiveServiceResolutionRecord,
  NativePluginManagerSummary,
} from "../service-resolution";
export {
  getEffectivePluginManagerInventory,
  getEffectiveServiceResolution,
} from "../service-resolution";
export type {
  EffectiveMessagingTransportEntry,
  EffectiveTransportInventoryEntry,
  NativeMessagingTransportState,
} from "../transport-control";
export {
  getEffectiveMessagingTransportInventory,
  getEffectiveTransportInventory,
  getNativeMessagingTransportState,
  getNativeTransportControlPlane,
} from "../transport-control";

interface NativeFormsService {
  capabilityDescription?: string;
  isPersistenceAvailable?: () => boolean;
  listForms?: () => StoredFormRecord[];
  getTemplates?: () => Map<string, object> | object[] | Record<string, object>;
  createForm?: (
    templateOrForm: unknown,
    metadata?: unknown,
  ) => Promise<StoredFormRecord>;
  getForm?: (formId: string) => Promise<StoredFormRecord | undefined>;
  cancelForm?: (formId: string) => Promise<boolean>;
  forcePersist?: () => Promise<{ path: string; total: number }>;
}

interface NativePlanningService {
  capabilityDescription?: string;
  listPlans?: () => StoredPlanRecord[];
  getPlan?: (
    planId: string,
  ) => Promise<StoredPlanRecord | undefined> | StoredPlanRecord | undefined;
  createPlan?: (input: unknown) => Promise<StoredPlanRecord> | StoredPlanRecord;
  summary?: () => {
    total: number;
    active: number;
    draft: number;
    completed: number;
    linkedTasks: number;
    linkedWorkflows: number;
    delegationTasks: number;
    workflows: number;
  };
}

interface NativeCodeGenerationService {
  capabilityDescription?: string;
  performResearch?: (...args: unknown[]) => unknown;
  generatePRD?: (...args: unknown[]) => unknown;
  performQA?: (...args: unknown[]) => unknown;
  generateCode?: (...args: unknown[]) => unknown;
  generateCodeInternal?: (...args: unknown[]) => unknown;
  runValidationSuite?: (...args: unknown[]) => unknown;
  generateCodeInChunks?: (...args: unknown[]) => unknown;
  installDependencies?: (...args: unknown[]) => unknown;
}

interface NativeGitHubService {
  capabilityDescription?: string;
  createRepository?: (name: string, isPrivate?: boolean) => Promise<unknown>;
  deleteRepository?: (name: string) => Promise<unknown>;
}

interface NativeSecretsManagerService {
  capabilityDescription?: string;
  getSecret?: (key: string) => Promise<unknown> | unknown;
  setSecret?: (key: string, value: string) => Promise<unknown> | unknown;
  hasSecret?: (key: string) => Promise<boolean> | boolean;
  listSecretKeys?: () => Promise<string[]> | string[];
}

function countRecordLikeEntries(value: unknown): number {
  if (value instanceof Map) {
    return value.size;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length;
  }
  return 0;
}

function countFormsByStatus(
  forms: unknown[],
  status: "active" | "completed" | "cancelled",
): number {
  return forms.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return (
      ((entry as { status?: unknown }).status ?? "")
        .toString()
        .toLowerCase() === status
    );
  }).length;
}

export function getNativeFormsControlPlane(runtime: RuntimeLike) {
  const forms = getNativeServices(runtime).forms as
    | NativeFormsService
    | undefined;
  const formList = forms?.listForms?.() ?? [];
  const formEntries = Array.isArray(formList) ? formList : [];
  const templates = countRecordLikeEntries(forms?.getTemplates?.());
  const persistenceAvailable = forms?.isPersistenceAvailable?.() ?? false;

  return {
    source: forms ? ("native-plugin" as const) : ("product" as const),
    available: Boolean(forms),
    capability:
      forms?.capabilityDescription ??
      "Structured form workflows for native autocoder and operator collection flows.",
    persistenceAvailable,
    templates,
    forms: {
      total: formEntries.length,
      active: countFormsByStatus(formEntries, "active"),
      completed: countFormsByStatus(formEntries, "completed"),
      cancelled: countFormsByStatus(formEntries, "cancelled"),
    },
    supportsForcePersist: typeof forms?.forcePersist === "function",
    detail: forms
      ? `Forms service is live with ${templates} templates and ${formEntries.length} tracked forms.`
      : "Forms service is not available in the native runtime.",
  };
}

export function getNativePlanningControlPlane(runtime: RuntimeLike) {
  const planning = getNativeServices(runtime).planning as
    | NativePlanningService
    | undefined;
  const rawPlans = planning?.listPlans?.() ?? [];
  const plans = Array.isArray(rawPlans) ? rawPlans : [];
  const linkedTasks = plans.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return Boolean((entry as { taskId?: unknown }).taskId);
  }).length;
  const linkedWorkflows = plans.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return Boolean((entry as { workflowId?: unknown }).workflowId);
  }).length;

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

export function getNativeExecutionControlPlane(runtime: RuntimeLike) {
  const planningControl = getNativePlanningControlPlane(runtime);
  return getNativeExecutionControlPlaneDetails(runtime, planningControl);
}

export function getNativeResearchControlPlane(runtime: RuntimeLike) {
  const native = getNativeServices(runtime) as {
    codeGeneration?: NativeCodeGenerationService;
    forms?: NativeFormsService;
    github?: NativeGitHubService;
    secretsManager?: NativeSecretsManagerService;
  };
  const executionControl = getNativeExecutionControlPlane(runtime);
  const autocoderDependencies = {
    codeGeneration: Boolean(native.codeGeneration),
    e2b: executionControl.e2b.available,
    forms: Boolean(native.forms),
    github: Boolean(native.github),
    secretsManager: Boolean(native.secretsManager),
  };
  const autocoderReady =
    autocoderDependencies.codeGeneration &&
    autocoderDependencies.e2b &&
    autocoderDependencies.forms;

  return {
    actionBench: {
      source: "native-plugin" as const,
      available: true,
      actions: benchmarkConfig.totalActionsLoaded,
      suites: {
        typewriter: benchmarkConfig.typewriterEnabled,
        multiverseMath: benchmarkConfig.multiverseMathEnabled,
        relationalData: benchmarkConfig.relationalDataEnabled,
      },
      detail: `Official action-bench plugin is loaded with ${benchmarkConfig.totalActionsLoaded} benchmark actions.`,
    },
    autocoder: {
      source: "native-plugin" as const,
      available: true,
      ready: autocoderReady,
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Generates ElizaOS projects through native autocoder services when dependencies are present.",
      methods: executionControl.codeGeneration.methods,
      dependencies: autocoderDependencies,
      detail: autocoderReady
        ? "Official autocoder runtime services are available."
        : "Official autocoder plugin is installed, but code-generation readiness still depends on e2b/forms-backed runtime services.",
    },
  };
}
