export type AutomationTriggerType = "schedule" | "manual" | "webhook";
export type AutomationActionType = "prompt" | "run-agent" | "webhook";
export type AutomationRunStatus = "completed" | "failed" | "skipped";
export type AutomationTracePhase =
  | "trigger"
  | "condition"
  | "action"
  | "delivery";

export interface ScheduleAutomationTrigger {
  type: "schedule";
  schedule: string;
}

export interface ManualAutomationTrigger {
  type: "manual";
}

export interface WebhookAutomationTrigger {
  type: "webhook";
  token: string;
}

export type AutomationTrigger =
  | ScheduleAutomationTrigger
  | ManualAutomationTrigger
  | WebhookAutomationTrigger;

export type AutomationCondition =
  | { type: "always" }
  | {
      type: "payload";
      path: string;
      operator: "exists" | "equals" | "contains";
      value?: string;
    };

export type AutomationAction =
  | {
      type: "prompt" | "run-agent";
      prompt: string;
    }
  | {
      type: "webhook";
      url: string;
      method: "POST";
    };

export interface AutomationTraceStep {
  id: string;
  phase: AutomationTracePhase;
  status: AutomationRunStatus;
  message: string;
  createdAt: string;
}

export interface AutomationRuntimeOverrides {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  personalityId?: string;
}

export interface AutomationJobRecord {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  delivery: "origin" | "local" | "home";
  skills: string[];
  runtime?: AutomationRuntimeOverrides;
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

/**
 * Product-facing service identities projected onto Eliza Trigger Tasks.
 * Keeping these in the shared contract prevents the runtime and plugin from
 * silently drifting onto different service names.
 */
export const DOOLITTLE_AUTOMATION_SERVICE = "cron";
export const DOOLITTLE_WORKFLOW_DISPATCH_SERVICE = "WORKFLOW_DISPATCH";
