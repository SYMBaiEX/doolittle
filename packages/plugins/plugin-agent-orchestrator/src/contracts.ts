type DelegationTaskRecord = {
  id: string;
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  childTaskIds?: string[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode: "local" | "delegated";
  orchestrationMode?: DelegationOrchestrationMode;
  workerMode?: "inline" | "process";
  workerPid?: number;
  attempts?: number;
  maxAttempts?: number;
  startedAt?: string;
  lastOutputPath?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type DelegationTaskTree = {
  task: DelegationTaskRecord;
  children: DelegationTaskTree[];
};

export type DelegationAggregationSummary = {
  rootTaskId: string;
  orchestrationMode: DelegationOrchestrationMode;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  runningTasks: number;
  pendingTasks: number;
  completionRate: number;
  maxDepth: number;
  activeWorkers: number;
  stalledWorkers: number;
  leafTasks: number;
  completedOutputs: Array<{
    id: string;
    title: string;
    status: DelegationTaskRecord["status"];
    depth: number;
    executionMode: DelegationTaskRecord["executionMode"];
    orchestrationMode: DelegationOrchestrationMode;
    attempts: number;
    maxAttempts: number;
    lastNote?: string;
    lastOutputPath?: string;
  }>;
  blockers: Array<{
    id: string;
    title: string;
    status: DelegationTaskRecord["status"];
    depth: number;
    executionMode: DelegationTaskRecord["executionMode"];
    orchestrationMode: DelegationOrchestrationMode;
    attempts: number;
    maxAttempts: number;
    lastNote?: string;
    lastOutputPath?: string;
  }>;
};

export type DelegationOverview = {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  retryable: number;
  delegated: number;
  local: number;
  inlineWorkers: number;
  processWorkers: number;
  activeWorkers: number;
  aliveWorkers: number;
  stalledWorkers: number;
  concurrency: number;
  byProfile: Array<{ profile: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  byGroup: Array<{ group: string; count: number }>;
  byLabel: Array<{ label: string; count: number }>;
  byOrchestration: Array<{ mode: DelegationOrchestrationMode; count: number }>;
};

type DelegationSupervisionReport = {
  concurrency: number;
  started: string[];
  completed: string[];
  failed: { id: string; error: string }[];
  skipped: { id: string; reason: string }[];
  aggregations: DelegationAggregationSummary[];
  overview: DelegationOverview;
};

export type DelegationOrchestrationMode =
  | "sequential"
  | "parallel"
  | "hierarchical";

export type AgentOrchestratorDelegationTaskLike = DelegationTaskRecord;
export type AgentOrchestratorDelegationQueueSummaryLike = DelegationOverview;
type AgentOrchestratorDelegationTreeLike = DelegationTaskTree;
type AgentOrchestratorDelegationSupervisionReportLike =
  DelegationSupervisionReport;

export interface AgentOrchestratorPluginOptions {
  delegation: {
    create(input: {
      title: string;
      objective: string;
      metadata?: Record<string, string>;
      group?: string;
      profile?: string;
      priority?: "low" | "normal" | "high";
      labels?: string[];
      tags?: string[];
      parentTaskId?: string;
      executionMode?: "local" | "delegated";
      orchestrationMode?: DelegationOrchestrationMode;
      maxAttempts?: number;
    }): AgentOrchestratorDelegationTaskLike;
    list(): AgentOrchestratorDelegationTaskLike[];
    get(id: string): AgentOrchestratorDelegationTaskLike;
    queueSummary(): AgentOrchestratorDelegationQueueSummaryLike;
    overview(): DelegationOverview;
    getChildren?(id: string): AgentOrchestratorDelegationTaskLike[];
    tree?(id: string): AgentOrchestratorDelegationTreeLike;
    aggregate?(id: string): DelegationAggregationSummary;
    spawnChild(
      parentId: string,
      input: {
        title: string;
        objective: string;
        metadata?: Record<string, string>;
        profile?: string;
        priority?: "low" | "normal" | "high";
        tags?: string[];
        orchestrationMode?: DelegationOrchestrationMode;
      },
    ): AgentOrchestratorDelegationTaskLike;
    retryTask?(
      id: string,
      note?: string,
      options?: { cascadeChildren?: boolean },
    ): AgentOrchestratorDelegationTaskLike;
    cancel(id: string, note?: string): AgentOrchestratorDelegationTaskLike;
    supervise(
      runner: (task: AgentOrchestratorDelegationTaskLike) => Promise<string>,
      options?: Record<string, unknown>,
    ): Promise<AgentOrchestratorDelegationSupervisionReportLike>;
    runQueued(
      runner: (task: AgentOrchestratorDelegationTaskLike) => Promise<string>,
      options?: Record<string, unknown>,
    ): Promise<AgentOrchestratorDelegationTaskLike[]>;
  };
}
