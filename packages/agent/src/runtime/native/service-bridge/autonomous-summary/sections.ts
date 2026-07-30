import type { AutonomousControlPlaneSummary } from "../autonomous";
import {
  countQueueActiveWorkers,
  countQueuePending,
} from "../autonomous-queue";
import type {
  AutonomousSummaryInput,
  NativeServicesSnapshot,
  ResolvedSkillsSummary,
} from "./types";

export function resolveSkillsSummary(
  skillsSummary: unknown,
): ResolvedSkillsSummary {
  return typeof skillsSummary === "object" && skillsSummary !== null
    ? (skillsSummary as ResolvedSkillsSummary)
    : null;
}

export function collectServiceSources(
  native: NativeServicesSnapshot,
): unknown[] {
  return [
    native.agentSkills,
    native.agentOrchestrator,
    native.codingAgent,
    native.trajectoryLogger,
    native.pluginManager,
    native.actionPlanning,
    native.operatorPlanning,
    native.approval,
    native.agentEvent,
    native.toolPolicy,
  ];
}

export function buildSkillsSection(
  input: AutonomousSummaryInput,
  skillsSummary: ResolvedSkillsSummary,
): AutonomousControlPlaneSummary["skills"] {
  return {
    source: "native",
    available: true,
    localSkills: Array.isArray(input.localSkills)
      ? input.localSkills.length
      : 0,
    workspaceTotal: skillsSummary
      ? Number(skillsSummary.total ?? input.localSkills.length)
      : input.localSkills.length,
    workspaceCurated: skillsSummary ? Number(skillsSummary.curated ?? 0) : 0,
    workspaceGenerated: skillsSummary
      ? Number(skillsSummary.generated ?? 0)
      : 0,
    workspaceFamilies: skillsSummary ? (skillsSummary.roots?.length ?? 0) : 0,
    catalogProjected: input.skillsHub.catalogProjected,
    catalogSkills: input.skillsHub.catalogTotal,
  };
}

export function buildOrchestratorSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["orchestrator"] {
  return {
    source: "native",
    available: true,
    tasks:
      input.orchestratorSummary?.tasks ??
      (Array.isArray(input.orchestratorTasks)
        ? input.orchestratorTasks.length
        : 0),
    queuePending:
      input.orchestratorSummary?.queuePending ??
      countQueuePending(input.orchestratorQueue),
    activeWorkers:
      input.orchestratorSummary?.activeWorkers ??
      countQueueActiveWorkers(input.orchestratorQueue),
  };
}

export function buildCodingAgentSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["codingAgent"] {
  return {
    source: "native",
    available: true,
    workspace:
      typeof input.native.codingAgent.read === "function" &&
      typeof input.native.codingAgent.write === "function" &&
      typeof input.native.codingAgent.search === "function",
    repository:
      typeof input.native.codingAgent.repoStatus === "function" &&
      typeof input.native.codingAgent.repoDiff === "function" &&
      typeof input.native.codingAgent.repoLog === "function",
    shell: typeof input.native.codingAgent.run === "function",
    delegation: Boolean(input.native.agentOrchestrator),
  };
}

export function buildTrajectoriesSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["trajectories"] {
  return {
    source: "native",
    available: true,
    evaluationBundles: Array.isArray(input.evaluationBundles)
      ? input.evaluationBundles.length
      : 0,
    latestEvaluationBundleAvailable: Boolean(input.latestEvaluationBundle),
  };
}

export function buildPluginManagerSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["pluginManager"] {
  return {
    source: input.native.pluginManager ? "native" : "unavailable",
    available: Boolean(input.native.pluginManager),
    plugins: input.pluginInventory?.summary?.total ?? 0,
    categories: input.pluginInventory?.summary?.categories ?? 0,
    enabled: input.pluginInventory?.summary?.enabled ?? 0,
    official: input.pluginInventory?.summary?.official ?? 0,
    vendored: input.pluginInventory?.summary?.vendored ?? 0,
  };
}

export function buildMediaSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["media"] {
  return {
    tts: {
      source: "native-plugin" as const,
      available: true,
      configured: input.mediaControl.tts.configured,
      provider: input.mediaControl.tts.provider,
    },
  };
}

export function buildResearchSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["research"] {
  return {
    actionBench: {
      source: "native-plugin" as const,
      available: input.researchControl.actionBench.available,
      actions: input.researchControl.actionBench.actions,
    },
    autocoder: {
      source: "native-plugin" as const,
      available: input.researchControl.autocoder.available,
      ready: input.researchControl.autocoder.ready,
    },
  };
}

export function buildFormsSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["forms"] {
  return {
    source: input.native.forms ? "native" : "unavailable",
    available: Boolean(input.native.forms),
    total: input.formsControl.forms.total,
    templates: input.formsControl.templates,
  };
}

export function buildExecutionSection(
  input: AutonomousSummaryInput,
): AutonomousControlPlaneSummary["execution"] {
  return {
    approvals: {
      source: input.native.approval ? "native" : "unavailable",
      available: Boolean(input.native.approval),
      asyncRequest: input.executionControl.approvals.asyncRequest,
      selectionHandling: input.executionControl.approvals.selectionHandling,
    },
    agentEvents: {
      source: input.native.agentEvent ? "native" : "unavailable",
      available: Boolean(input.native.agentEvent),
      heartbeat: input.executionControl.agentEvents.heartbeat,
      lastHeartbeatStatus:
        input.executionControl.agentEvents.lastHeartbeatStatus,
    },
    e2b: {
      source: input.native.e2b ? "native" : "unavailable",
      available: Boolean(input.native.e2b),
      sandboxes: input.executionControl.e2b.sandboxes,
    },
    toolPolicy: {
      source: input.native.toolPolicy ? "native" : "unavailable",
      available: Boolean(input.native.toolPolicy),
      actions: input.executionControl.toolPolicy.actions,
      codingAllowed: input.executionControl.toolPolicy.codingAllowed,
      messagingAllowed: input.executionControl.toolPolicy.messagingAllowed,
      fullAllowed: input.executionControl.toolPolicy.fullAllowed,
    },
    planning: {
      source:
        input.native.actionPlanning || input.native.operatorPlanning
          ? "native"
          : "unavailable",
      available: Boolean(
        input.native.actionPlanning || input.native.operatorPlanning,
      ),
      operatorPlanningAvailable: Boolean(input.native.operatorPlanning),
      plans: input.executionControl.planning.plans.total,
    },
    codeGeneration: {
      source: input.native.codeGeneration ? "native" : "unavailable",
      available: Boolean(input.native.codeGeneration),
      ready: input.executionControl.codeGeneration.ready,
    },
  };
}
