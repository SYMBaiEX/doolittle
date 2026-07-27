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
