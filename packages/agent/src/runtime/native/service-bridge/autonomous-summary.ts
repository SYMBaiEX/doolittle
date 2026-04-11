import { describeAutonomousAlignment } from "../autonomous-stack";
import type { AutonomousControlPlaneSummary } from "./autonomous/index";
import { countQueueActiveWorkers, countQueuePending } from "./autonomous-queue";

type NativeServicesSnapshot = {
  agentSkills?: unknown;
  agentOrchestrator?: unknown;
  codingAgent?: {
    read?: unknown;
    write?: unknown;
    search?: unknown;
    repoStatus?: unknown;
    repoDiff?: unknown;
    repoLog?: unknown;
    run?: unknown;
    delegate?: unknown;
  } | null;
  trajectoryLogger?: {
    bundles?: unknown;
    exportLatest?: unknown;
  } | null;
  pluginManager?: unknown;
  planning?: unknown;
  approval?: unknown;
  agentEvent?: unknown;
  toolPolicy?: unknown;
  forms?: unknown;
  e2b?: unknown;
  codeGeneration?: unknown;
};

type PluginInventoryLike = {
  summary?: {
    total?: number;
    categories?: number;
    enabled?: number;
    official?: number;
    vendored?: number;
  };
} | null;

type FormsControlLike = {
  forms: {
    total: number;
  };
  templates: number;
};

type ExecutionControlLike = {
  approvals: {
    asyncRequest: boolean;
    selectionHandling: boolean;
  };
  agentEvents: {
    heartbeat: boolean;
    lastHeartbeatStatus: string | null;
  };
  e2b: {
    sandboxes: number;
  };
  toolPolicy: {
    actions: number;
    codingAllowed: number;
    messagingAllowed: number;
    fullAllowed: number;
  };
  planning: {
    plans: {
      total: number;
    };
  };
  codeGeneration: {
    ready: boolean;
  };
};

export function buildAutonomousControlPlaneSummary(input: {
  config?: Parameters<typeof describeAutonomousAlignment>[0];
  native: NativeServicesSnapshot;
  localSkills: unknown[];
  skillsSummary: unknown;
  skillsCatalog:
    | {
        total?: number;
        trending?: unknown[];
      }
    | null
    | undefined;
  orchestratorSummary?: {
    tasks?: number;
    queuePending?: number;
    activeWorkers?: number;
  } | null;
  orchestratorTasks: unknown[];
  orchestratorQueue: unknown;
  trajectoryBundles: unknown[];
  latestTrajectory: unknown;
  pluginInventory: PluginInventoryLike;
  mediaControl: {
    tts: {
      configured: boolean;
      provider: "fal" | "openai" | "none";
    };
  };
  researchControl: {
    actionBench: {
      available: boolean;
      actions: number;
    };
    autocoder: {
      available: boolean;
      ready: boolean;
    };
  };
  formsControl: FormsControlLike;
  executionControl: ExecutionControlLike;
}): AutonomousControlPlaneSummary {
  const {
    config,
    native,
    localSkills,
    skillsCatalog,
    orchestratorSummary,
    orchestratorTasks,
    orchestratorQueue,
    trajectoryBundles,
    latestTrajectory,
    pluginInventory,
    mediaControl,
    researchControl,
    formsControl,
    executionControl,
  } = input;
  const resolvedSkillsSummary =
    typeof input.skillsSummary === "object" && input.skillsSummary !== null
      ? (input.skillsSummary as {
          total?: number;
          curated?: number;
          generated?: number;
          roots?: Array<{ name: string }>;
        })
      : null;

  const serviceSources = [
    native.agentSkills,
    native.agentOrchestrator,
    native.codingAgent,
    native.trajectoryLogger,
    native.pluginManager,
    native.planning,
    native.approval,
    native.agentEvent,
    native.toolPolicy,
  ];

  return {
    alignment: describeAutonomousAlignment(config),
    skills: {
      source: native.agentSkills ? "native" : "product",
      available: Boolean(native.agentSkills),
      localSkills: Array.isArray(localSkills) ? localSkills.length : 0,
      workspaceTotal: resolvedSkillsSummary
        ? Number(resolvedSkillsSummary.total ?? localSkills.length)
        : localSkills.length,
      workspaceCurated: resolvedSkillsSummary
        ? Number(resolvedSkillsSummary.curated ?? 0)
        : 0,
      workspaceGenerated: resolvedSkillsSummary
        ? Number(resolvedSkillsSummary.generated ?? 0)
        : 0,
      workspaceFamilies: resolvedSkillsSummary
        ? (resolvedSkillsSummary.roots?.length ?? 0)
        : 0,
      catalogSkills: skillsCatalog?.total ?? 0,
      trendingSkills: skillsCatalog?.trending?.length ?? 0,
    },
    orchestrator: {
      source: native.agentOrchestrator ? "native" : "product",
      available: Boolean(native.agentOrchestrator),
      tasks:
        orchestratorSummary?.tasks ??
        (Array.isArray(orchestratorTasks) ? orchestratorTasks.length : 0),
      queuePending:
        orchestratorSummary?.queuePending ??
        countQueuePending(orchestratorQueue),
      activeWorkers:
        orchestratorSummary?.activeWorkers ??
        countQueueActiveWorkers(orchestratorQueue),
    },
    codingAgent: {
      source: native.codingAgent ? "native" : "product",
      available: Boolean(native.codingAgent),
      workspace:
        typeof native.codingAgent?.read === "function" &&
        typeof native.codingAgent?.write === "function" &&
        typeof native.codingAgent?.search === "function",
      repository:
        typeof native.codingAgent?.repoStatus === "function" &&
        typeof native.codingAgent?.repoDiff === "function" &&
        typeof native.codingAgent?.repoLog === "function",
      shell: typeof native.codingAgent?.run === "function",
      delegation: typeof native.codingAgent?.delegate === "function",
    },
    trajectories: {
      source: native.trajectoryLogger ? "native" : "product",
      available: Boolean(native.trajectoryLogger),
      bundles: Array.isArray(trajectoryBundles) ? trajectoryBundles.length : 0,
      latestAvailable: Boolean(latestTrajectory),
    },
    pluginManager: {
      source: native.pluginManager ? "native" : "product",
      available: Boolean(native.pluginManager),
      plugins: pluginInventory?.summary?.total ?? 0,
      categories: pluginInventory?.summary?.categories ?? 0,
      enabled: pluginInventory?.summary?.enabled ?? 0,
      official: pluginInventory?.summary?.official ?? 0,
      vendored: pluginInventory?.summary?.vendored ?? 0,
    },
    media: {
      tts: {
        source: "native-plugin",
        available: true,
        configured: mediaControl.tts.configured,
        provider: mediaControl.tts.provider,
      },
    },
    research: {
      actionBench: {
        source: "native-plugin",
        available: researchControl.actionBench.available,
        actions: researchControl.actionBench.actions,
      },
      autocoder: {
        source: "native-plugin",
        available: researchControl.autocoder.available,
        ready: researchControl.autocoder.ready,
      },
    },
    forms: {
      source: native.forms ? "native" : "product",
      available: Boolean(native.forms),
      total: formsControl.forms.total,
      templates: formsControl.templates,
    },
    execution: {
      approvals: {
        source: native.approval ? "native" : "product",
        available: Boolean(native.approval),
        asyncRequest: executionControl.approvals.asyncRequest,
        selectionHandling: executionControl.approvals.selectionHandling,
      },
      agentEvents: {
        source: native.agentEvent ? "native" : "product",
        available: Boolean(native.agentEvent),
        heartbeat: executionControl.agentEvents.heartbeat,
        lastHeartbeatStatus: executionControl.agentEvents.lastHeartbeatStatus,
      },
      e2b: {
        source: native.e2b ? "native" : "product",
        available: Boolean(native.e2b),
        sandboxes: executionControl.e2b.sandboxes,
      },
      toolPolicy: {
        source: native.toolPolicy ? "native" : "product",
        available: Boolean(native.toolPolicy),
        actions: executionControl.toolPolicy.actions,
        codingAllowed: executionControl.toolPolicy.codingAllowed,
        messagingAllowed: executionControl.toolPolicy.messagingAllowed,
        fullAllowed: executionControl.toolPolicy.fullAllowed,
      },
      planning: {
        source: native.planning ? "native" : "product",
        available: Boolean(native.planning),
        plans: executionControl.planning.plans.total,
      },
      codeGeneration: {
        source: native.codeGeneration ? "native" : "product",
        available: Boolean(native.codeGeneration),
        ready: executionControl.codeGeneration.ready,
      },
    },
    totals: {
      nativeServices: serviceSources.filter(Boolean).length,
      productFallbacks: serviceSources.filter((entry) => !entry).length,
    },
  };
}
