import {
  getNativeE2BSandboxControlPlane,
  type NativeE2BService,
} from "./execution-control-plane";
import { getNativeServices, type RuntimeLike } from "./runtime";
import type { NativeToolPolicyService } from "./runtime-contracts";

interface NativeFormsService {
  capabilityDescription?: string;
  isPersistenceAvailable?: () => boolean;
  listForms?: () => unknown[];
  getTemplates?: () => Map<string, object> | object[] | Record<string, object>;
  createForm?: (
    templateOrForm: unknown,
    metadata?: unknown,
  ) => Promise<unknown>;
  getForm?: (formId: string) => Promise<unknown | undefined>;
  cancelForm?: (formId: string) => Promise<boolean>;
  forcePersist?: () => Promise<{ path: string; total: number }>;
}

interface NativePlanningService {
  capabilityDescription?: string;
  listPlans?: () => unknown[];
  getPlan?: (planId: string) => Promise<unknown | undefined> | unknown;
  createPlan?: (input: unknown) => Promise<unknown> | unknown;
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

interface NativeApprovalService {
  requestApprovalAsync?(input: unknown): Promise<string>;
  handleSelection?(taskId: string, selectedOption: string): Promise<void>;
  getPendingApprovals?(roomId: string): Promise<unknown[]>;
}

interface NativeAgentEventService {
  subscribeHeartbeat?: () => unknown;
  getLastHeartbeat?: () => { status?: string };
}

interface NativePlanningControlPlane {
  source: "native-plugin" | "product";
  available: boolean;
  capability: string;
  plans: {
    total: number;
    linkedTasks: number;
    linkedWorkflows: number;
  };
  supportsCreate: boolean;
  detail: string;
}

export function getNativeExecutionControlPlaneDetails(
  runtime: RuntimeLike,
  planningControl: NativePlanningControlPlane,
) {
  const native = getNativeServices(runtime) as {
    approval?: NativeApprovalService;
    agentEvent?: NativeAgentEventService | null;
    e2b?: NativeE2BService;
    toolPolicy?: NativeToolPolicyService;
    forms?: NativeFormsService;
    planning?: NativePlanningService;
    codeGeneration?: NativeCodeGenerationService;
    github?: NativeGitHubService;
    secretsManager?: NativeSecretsManagerService;
  };
  const runtimeActions =
    typeof runtime.getAllActions === "function"
      ? runtime.getAllActions().map((action: { name: string }) => action.name)
      : [];
  const e2bControl = getNativeE2BSandboxControlPlane(runtime);
  const codeGenerationMethods = [
    "performResearch",
    "generatePRD",
    "performQA",
    "generateCode",
    "generateCodeInternal",
    "runValidationSuite",
    "generateCodeInChunks",
    "installDependencies",
  ].filter(
    (method) =>
      typeof native.codeGeneration?.[
        method as keyof NativeCodeGenerationService
      ] === "function",
  );
  const rawSecretKeys = native.secretsManager?.listSecretKeys?.();
  const secretKeys = Array.isArray(rawSecretKeys) ? rawSecretKeys : [];

  return {
    approvals: {
      source: native.approval ? ("native" as const) : ("product" as const),
      available: Boolean(native.approval),
      asyncRequest: typeof native.approval?.requestApprovalAsync === "function",
      selectionHandling: typeof native.approval?.handleSelection === "function",
    },
    agentEvents: {
      source: native.agentEvent ? ("native" as const) : ("product" as const),
      available: Boolean(native.agentEvent),
      heartbeat: typeof native.agentEvent?.subscribeHeartbeat === "function",
      lastHeartbeatStatus:
        native.agentEvent?.getLastHeartbeat?.()?.status ?? null,
    },
    e2b: e2bControl,
    toolPolicy: {
      source: native.toolPolicy ? ("native" as const) : ("product" as const),
      available: Boolean(native.toolPolicy),
      actions: runtimeActions.length,
      codingAllowed:
        native.toolPolicy?.getAllowedTools?.(
          { profile: "coding" },
          runtimeActions,
        ).length ?? runtimeActions.length,
      messagingAllowed:
        native.toolPolicy?.getAllowedTools?.(
          { profile: "messaging" },
          runtimeActions,
        ).length ?? runtimeActions.length,
      fullAllowed:
        native.toolPolicy?.getAllowedTools?.(
          { profile: "full" },
          runtimeActions,
        ).length ?? runtimeActions.length,
    },
    planning: planningControl,
    codeGeneration: {
      source: native.codeGeneration
        ? ("native-plugin" as const)
        : ("product" as const),
      available: Boolean(native.codeGeneration),
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Native code generation and autocoder workflows.",
      methods: codeGenerationMethods,
      ready:
        Boolean(native.codeGeneration) &&
        e2bControl.available &&
        Boolean(native.forms),
      detail: native.codeGeneration
        ? `Code generation service exposes ${codeGenerationMethods.length} runtime methods.`
        : "Code generation service is unavailable.",
    },
    github: {
      available: Boolean(native.github),
      capability:
        native.github?.capabilityDescription ??
        "GitHub repository lifecycle support for code generation flows.",
      createRepository: typeof native.github?.createRepository === "function",
      deleteRepository: typeof native.github?.deleteRepository === "function",
    },
    secretsManager: {
      available: Boolean(native.secretsManager),
      capability:
        native.secretsManager?.capabilityDescription ??
        "Secrets management for native autocoder and deployment flows.",
      keys: secretKeys,
      hasListKeys: typeof native.secretsManager?.listSecretKeys === "function",
      hasRead: typeof native.secretsManager?.getSecret === "function",
      hasWrite: typeof native.secretsManager?.setSecret === "function",
    },
  };
}
