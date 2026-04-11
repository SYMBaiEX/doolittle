import type {
  DelegationOrchestrationMode,
  DelegationTaskRecord,
} from "@/types";

export interface DelegationWorkerStatus {
  id: string;
  title: string;
  objective: string;
  group?: string;
  profile?: string;
  priority?: DelegationTaskRecord["priority"];
  tags?: string[];
  labels?: string[];
  metadata?: Record<string, string>;
  parentTaskId?: string;
  childTaskIds?: string[];
  status: DelegationTaskRecord["status"];
  executionMode: DelegationTaskRecord["executionMode"];
  workerMode: DelegationTaskRecord["workerMode"];
  workerPid?: number;
  attempts: number;
  attemptsRemaining: number;
  maxAttempts: number;
  startedAt?: string;
  completedAt?: string;
  lastOutputPath?: string;
  alive: boolean;
  stalled: boolean;
  durationMs?: number;
  notesCount: number;
}

export interface DelegationOverview {
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
}

export interface DelegationTaskFilter {
  group?: string;
  profile?: string;
  priority?: DelegationTaskRecord["priority"];
  label?: string;
  parentTaskId?: string;
  status?: DelegationTaskRecord["status"];
  executionMode?: DelegationTaskRecord["executionMode"];
}

export interface DelegationTaskTree {
  task: DelegationTaskRecord;
  children: DelegationTaskTree[];
}

export interface DelegationAggregationItem {
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
}

export interface DelegationAggregationSummary {
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
  completedOutputs: DelegationAggregationItem[];
  blockers: DelegationAggregationItem[];
}
