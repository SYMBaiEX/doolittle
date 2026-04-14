import type { describeAutonomousAlignment } from "../../autonomous-stack";

export type NativeServicesSnapshot = {
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

export type PluginInventoryLike = {
  summary?: {
    total?: number;
    categories?: number;
    enabled?: number;
    official?: number;
    vendored?: number;
  };
} | null;

export type FormsControlLike = {
  forms: {
    total: number;
  };
  templates: number;
};

export type ExecutionControlLike = {
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

export type AutonomousSummaryInput = {
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
};

export type ResolvedSkillsSummary = {
  total?: number;
  curated?: number;
  generated?: number;
  roots?: Array<{ name: string }>;
} | null;
