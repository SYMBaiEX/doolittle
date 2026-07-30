import type {
  AutomationAction,
  AutomationCondition,
  AutomationJobRecord,
  AutomationRunRecord,
  AutomationRuntimeOverrides,
} from "@/types";

export type AutomationTriggerInput =
  | { type: "schedule"; schedule: string }
  | { type: "manual" }
  | { type: "webhook"; token?: string };

export interface AutomationExecutionContext {
  source: "schedule" | "manual" | "webhook";
  payload?: Record<string, unknown>;
}

export type AutomationExecutor = (
  job: AutomationJobRecord,
  context: AutomationExecutionContext,
) => Promise<string>;

export interface CreateAutomationInput {
  name: string;
  prompt?: string;
  schedule?: string;
  skills?: string[];
  delivery?: "origin" | "local" | "home";
  runtime?: AutomationRuntimeOverrides;
  trigger?: AutomationTriggerInput;
  condition?: AutomationCondition;
  action?: AutomationAction;
}

export type {
  AutomationJobRecord,
  AutomationRunRecord,
  AutomationRuntimeOverrides,
};
