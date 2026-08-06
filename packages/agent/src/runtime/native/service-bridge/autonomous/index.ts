import type { AppServices } from "@/services";
import type { EnvConfig } from "@/types/runtime";
import type { describeAutonomousAlignment } from "../../autonomous-stack";
import {
  getEffectiveSkills,
  getEffectiveSkillsSummary,
} from "../autonomous-skills";
import { buildAutonomousControlPlaneSummary } from "../autonomous-summary";
import {
  getEffectivePluginManagerInventory,
  getNativeExecutionControlPlane,
  getNativeFormsControlPlane,
  getNativeMediaControlPlane,
  getNativeResearchControlPlane,
} from "../control-planes";
import { requireOfficialOrchestrator } from "../delegation";
import { getNativeServices, type RuntimeLike } from "../runtime";
import { requireOfficialAgentSkills } from "../skill-hub";
import { requireNativeCodingAgent } from "../tooling/native-services";
import { requireNativeTrajectoryLogger } from "../trajectory";

export interface AutonomousControlPlaneSummary {
  alignment: ReturnType<typeof describeAutonomousAlignment>;
  skills: {
    source: "native";
    available: true;
    localSkills: number;
    workspaceTotal: number;
    workspaceCurated: number;
    workspaceGenerated: number;
    workspaceFamilies: number;
    catalogProjected: boolean;
    catalogSkills: number;
  };
  orchestrator: {
    source: "native";
    available: true;
    tasks: number;
    queuePending: number;
    activeWorkers: number;
  };
  codingAgent: {
    source: "native";
    available: true;
    workspace: boolean;
    repository: boolean;
    shell: boolean;
    delegation: boolean;
  };
  trajectories: {
    source: "native";
    available: true;
    evaluationBundles: number;
    latestEvaluationBundleAvailable: boolean;
  };
  pluginManager: {
    source: "native" | "unavailable";
    available: boolean;
    plugins: number;
    categories: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  media: {
    tts: {
      source: "native-plugin";
      available: boolean;
      configured: boolean;
      provider: "fal" | "openai" | "none";
    };
  };
  research: {
    actionBench: {
      source: "product-plugin";
      available: boolean;
      actions: number;
    };
    autocoder: {
      source: "product-plugin";
      available: boolean;
      ready: boolean;
    };
  };
  forms: {
    source: "product-plugin" | "unavailable";
    available: boolean;
    total: number;
    templates: number;
  };
  execution: {
    approvals: {
      source: "native" | "unavailable";
      available: boolean;
      asyncRequest: boolean;
      selectionHandling: boolean;
    };
    agentEvents: {
      source: "native" | "unavailable";
      available: boolean;
      heartbeat: boolean;
      lastHeartbeatStatus: string | null;
    };
    e2b: {
      source: "product-plugin" | "unavailable";
      available: boolean;
      sandboxes: number;
    };
    toolPolicy: {
      source: "native" | "unavailable";
      available: boolean;
      actions: number;
      codingAllowed: number;
      messagingAllowed: number;
      fullAllowed: number;
    };
    planning: {
      source: "native" | "product-plugin" | "unavailable";
      available: boolean;
      operatorPlanningAvailable: boolean;
      plans: number;
    };
    codeGeneration: {
      source: "product-plugin" | "unavailable";
      available: boolean;
      ready: boolean;
    };
  };
  totals: {
    nativeServices: number;
    unavailableServices: number;
  };
}

export {
  countQueueActiveWorkers,
  countQueuePending,
} from "../autonomous-queue";
export {
  getEffectiveSkills,
  getEffectiveSkillsSummary,
} from "../autonomous-skills";

export function getAutonomousControlPlane(
  runtime: RuntimeLike,
  services: AppServices,
  config?: EnvConfig,
): AutonomousControlPlaneSummary {
  const native = {
    ...getNativeServices(runtime),
    agentSkills: requireOfficialAgentSkills(runtime),
    agentOrchestrator: requireOfficialOrchestrator(runtime),
    codingAgent: requireNativeCodingAgent(runtime),
    trajectoryLogger: requireNativeTrajectoryLogger(runtime),
  };
  const formsControl = getNativeFormsControlPlane(runtime);
  const executionControl = getNativeExecutionControlPlane(runtime);
  const skillsHub = services.skillsHub.summary();
  const skillsSummary = getEffectiveSkillsSummary(runtime, services);
  const localSkills = getEffectiveSkills(runtime, services);
  // This control-plane renderer is synchronous. The product delegation service
  // is a read projection of the official async task service; it never owns
  // persistence or worker lifecycle.
  const orchestratorTasks = services.delegationProjection.list();
  const orchestratorQueue = services.delegationProjection.queueSummary();
  const orchestratorSummary = {
    tasks: orchestratorTasks.length,
    queuePending: orchestratorTasks.filter((task) => task.status === "pending")
      .length,
    activeWorkers: orchestratorTasks.filter((task) => task.status === "running")
      .length,
  };
  const pluginInventory = getEffectivePluginManagerInventory(runtime);
  const mediaControl = config
    ? getNativeMediaControlPlane(config)
    : {
        tts: {
          source: "native-plugin" as const,
          available: true,
          configured: false,
          provider: "none" as const,
        },
      };
  const researchControl = getNativeResearchControlPlane(runtime);
  // The SDK service owns canonical runtime recording. Doolittle's evaluation
  // service owns a separate, explicitly non-training bundle projection.
  const evaluationBundles = services.trajectoryEvaluation.listBundles();
  const latestEvaluationBundle = services.trajectoryEvaluation.exportLatest();

  return buildAutonomousControlPlaneSummary({
    config,
    native,
    localSkills,
    skillsSummary,
    skillsHub,
    orchestratorSummary,
    orchestratorTasks: Array.isArray(orchestratorTasks)
      ? orchestratorTasks
      : [],
    orchestratorQueue,
    evaluationBundles: Array.isArray(evaluationBundles)
      ? evaluationBundles
      : [],
    latestEvaluationBundle,
    pluginInventory,
    mediaControl,
    researchControl,
    formsControl,
    executionControl,
  });
}
