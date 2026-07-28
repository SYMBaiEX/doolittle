import type {
  AutomationAction,
  AutomationCondition,
  AutomationRunRecord,
  CronJobRecord,
  CronJobRuntimeOverrides,
} from "@/types";

export type AutomationTriggerInput =
  | { type: "schedule"; schedule: string }
  | { type: "manual" }
  | { type: "webhook"; token?: string };

export interface AutomationExecutionContext {
  source: "schedule" | "manual" | "webhook";
  payload?: Record<string, unknown>;
}

export type CronExecutor = (
  job: CronJobRecord,
  context: AutomationExecutionContext,
) => Promise<string>;

export interface CreateCronJobInput {
  name: string;
  prompt?: string;
  schedule?: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: CronJobRuntimeOverrides;
  trigger?: AutomationTriggerInput;
  condition?: AutomationCondition;
  action?: AutomationAction;
}

export interface UpdateCronJobInput {
  name?: string;
  prompt?: string;
  schedule?: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: CronJobRuntimeOverrides;
  clearRuntime?: boolean;
  trigger?: AutomationTriggerInput;
  condition?: AutomationCondition;
  action?: AutomationAction;
}

export interface CronTickResult {
  jobs: CronJobRecord[];
  dirty: boolean;
}

export type { AutomationRunRecord, CronJobRecord, CronJobRuntimeOverrides };
