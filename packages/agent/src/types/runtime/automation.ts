import type {
  AutomationAction,
  AutomationCondition,
  AutomationRunStatus,
  AutomationTraceStep,
  AutomationTrigger,
} from "@doolittle/contracts";

export type {
  AutomationAction,
  AutomationCondition,
  AutomationRunStatus,
  AutomationTracePhase,
  AutomationTraceStep,
  AutomationTrigger,
} from "@doolittle/contracts";

export interface SkillDocument {
  slug: string;
  title: string;
  description: string;
  path: string;
  content: string;
  source?:
    | "workspace"
    | "generated"
    | "bundled"
    | "managed"
    | "project"
    | "curated"
    | "plugin"
    | "extra";
  commandName?: string;
  userInvocable?: boolean;
  disableModelInvocation?: boolean;
}

export interface CronJobRuntimeOverrides {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  personalityId?: string;
}

export interface CronJobRecord {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  delivery: "origin" | "local" | "home";
  skills: string[];
  runtime?: CronJobRuntimeOverrides;
  status: "active" | "paused";
  oneShot: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
  trigger?: AutomationTrigger;
  condition?: AutomationCondition;
  action?: AutomationAction;
}

export interface AutomationRunRecord {
  id: string;
  jobId: string;
  jobName: string;
  output: string;
  outputPath?: string;
  createdAt: string;
  status?: AutomationRunStatus;
  triggerType?: AutomationTrigger["type"];
  actionType?: AutomationAction["type"];
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  trace?: AutomationTraceStep[];
}

export interface HookDefinition {
  id: string;
  event: string;
  name: string;
  enabled: boolean;
  template: string;
}

export interface HookInvocation {
  hookId: string;
  event: string;
  payload: Record<string, unknown>;
  rendered: string;
  createdAt: string;
}
