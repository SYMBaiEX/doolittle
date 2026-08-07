import type { NativePlanningControlPlane } from "./control-planes/types";
import { getNativeE2BSandboxControlPlane } from "./execution-control-plane";
import { getNativeServices, type RuntimeLike } from "./runtime";
import type { NativeCodeGenerationService } from "./runtime-contracts";

export function getNativeExecutionControlPlaneDetails(
  runtime: RuntimeLike,
  planningControl: NativePlanningControlPlane,
) {
  const native = getNativeServices(runtime);
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
  return {
    approvals: {
      source: native.approval ? ("native" as const) : ("unavailable" as const),
      available: Boolean(native.approval),
      asyncRequest: typeof native.approval?.requestApprovalAsync === "function",
      selectionHandling: typeof native.approval?.handleSelection === "function",
    },
    agentEvents: {
      source: native.agentEvent
        ? ("native" as const)
        : ("unavailable" as const),
      available: Boolean(native.agentEvent),
      heartbeat: typeof native.agentEvent?.subscribeHeartbeat === "function",
      lastHeartbeatStatus:
        native.agentEvent?.getLastHeartbeat?.()?.status ?? null,
    },
    e2b: e2bControl,
    toolPolicy: {
      source: native.toolPolicy
        ? ("native" as const)
        : ("unavailable" as const),
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
        ? ("product-plugin" as const)
        : ("unavailable" as const),
      available: Boolean(native.codeGeneration),
      capability:
        native.codeGeneration?.capabilityDescription ??
        "Doolittle experimental autocoder planning workflows.",
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
      available: Boolean(native.githubPlanning),
      capability:
        native.githubPlanning?.capabilityDescription ??
        "GitHub repository lifecycle support for code generation flows.",
      createRepository:
        typeof native.githubPlanning?.createRepository === "function",
      deleteRepository:
        typeof native.githubPlanning?.deleteRepository === "function",
    },
    secrets: {
      available: Boolean(native.secrets),
      capability:
        native.secrets?.capabilityDescription ??
        "Eliza encrypted global, world, and user secrets management.",
      // The official list contract is asynchronous. The synchronous control
      // plane reports capability only; API callers use listEffectiveSecretKeys.
      keys: [],
      hasListKeys: typeof native.secrets?.list === "function",
      hasRead: typeof native.secrets?.getGlobal === "function",
      hasWrite: typeof native.secrets?.setGlobal === "function",
    },
  };
}
