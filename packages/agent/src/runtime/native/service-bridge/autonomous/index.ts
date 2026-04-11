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
import {
  getEffectiveDelegationQueue,
  getEffectiveDelegationTasks,
} from "../delegation";
import { getNativeServices, type RuntimeLike } from "../runtime";

export interface AutonomousControlPlaneSummary {
  alignment: ReturnType<typeof describeAutonomousAlignment>;
  skills: {
    source: "native" | "product";
    available: boolean;
    localSkills: number;
    workspaceTotal: number;
    workspaceCurated: number;
    workspaceGenerated: number;
    workspaceFamilies: number;
    catalogSkills: number;
    trendingSkills: number;
  };
  orchestrator: {
    source: "native" | "product";
    available: boolean;
    tasks: number;
    queuePending: number;
    activeWorkers: number;
  };
  codingAgent: {
    source: "native" | "product";
    available: boolean;
    workspace: boolean;
    repository: boolean;
    shell: boolean;
    delegation: boolean;
  };
  trajectories: {
    source: "native" | "product";
    available: boolean;
    bundles: number;
    latestAvailable: boolean;
  };
  pluginManager: {
    source: "native" | "product";
    available: boolean;
    plugins: number;
    categories: number;
    enabled: number;
    official: number;
    vendored: number;
  };
  media: {
    tts: {
      source: "native-plugin" | "product";
      available: boolean;
      configured: boolean;
      provider: "fal" | "openai" | "none";
    };
  };
  research: {
    actionBench: {
      source: "native-plugin";
      available: boolean;
      actions: number;
    };
    autocoder: {
      source: "native-plugin";
      available: boolean;
      ready: boolean;
    };
  };
  forms: {
    source: "native" | "product";
    available: boolean;
    total: number;
    templates: number;
  };
  execution: {
    approvals: {
      source: "native" | "product";
      available: boolean;
      asyncRequest: boolean;
      selectionHandling: boolean;
    };
    agentEvents: {
      source: "native" | "product";
      available: boolean;
      heartbeat: boolean;
      lastHeartbeatStatus: string | null;
    };
    e2b: {
      source: "native" | "product";
      available: boolean;
      sandboxes: number;
    };
    toolPolicy: {
      source: "native" | "product";
      available: boolean;
      actions: number;
      codingAllowed: number;
      messagingAllowed: number;
      fullAllowed: number;
    };
    planning: {
      source: "native" | "product";
      available: boolean;
      plans: number;
    };
    codeGeneration: {
      source: "native" | "product";
      available: boolean;
      ready: boolean;
    };
  };
  totals: {
    nativeServices: number;
    productFallbacks: number;
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
  const native = getNativeServices(runtime);
  const formsControl = getNativeFormsControlPlane(runtime);
  const executionControl = getNativeExecutionControlPlane(runtime);
  const skillsCatalog = services.agentSdk.snapshot().skillCatalog;
  const skillsSummary = getEffectiveSkillsSummary(runtime, services);
  const localSkills = getEffectiveSkills(runtime, services);
  const orchestratorSummary = native.agentOrchestrator?.summary?.();
  const orchestratorTasks = getEffectiveDelegationTasks(runtime, services);
  const orchestratorQueue = getEffectiveDelegationQueue(runtime, services);
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
  const trajectoryBundles =
    typeof native.trajectoryLogger?.bundles === "function"
      ? native.trajectoryLogger.bundles()
      : services.trajectories.listBundles();
  const latestTrajectory =
    typeof native.trajectoryLogger?.exportLatest === "function"
      ? native.trajectoryLogger.exportLatest()
      : services.trajectories.exportLatest();

  return buildAutonomousControlPlaneSummary({
    config,
    native,
    localSkills,
    skillsSummary,
    skillsCatalog,
    orchestratorSummary,
    orchestratorTasks: Array.isArray(orchestratorTasks)
      ? orchestratorTasks
      : [],
    orchestratorQueue,
    trajectoryBundles: Array.isArray(trajectoryBundles)
      ? trajectoryBundles
      : [],
    latestTrajectory,
    pluginInventory,
    mediaControl,
    researchControl,
    formsControl,
    executionControl,
  });
}
