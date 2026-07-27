import { asRecord, asString, type UnknownRecord } from "./lib";

export type AutomationTriggerChoice = "schedule" | "manual" | "webhook";
export type AutomationActionChoice = "prompt" | "run-agent" | "webhook";
export type AutomationConditionChoice =
  | "always"
  | "exists"
  | "equals"
  | "contains";

export interface AutomationDraft {
  name: string;
  triggerType: AutomationTriggerChoice;
  schedule: string;
  conditionType: AutomationConditionChoice;
  conditionPath: string;
  conditionValue: string;
  actionType: AutomationActionChoice;
  prompt: string;
  webhookUrl: string;
}

export interface AutomationDefinitionSummary {
  triggerType: AutomationTriggerChoice;
  triggerLabel: string;
  conditionLabel: string;
  actionType: AutomationActionChoice;
  actionLabel: string;
  webhookPath?: string;
}

export type AutomationRequestResult =
  | { ok: true; payload: UnknownRecord }
  | { ok: false; error: string };

const conditionPathPattern = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/iu;

export function buildAutomationRequest(
  draft: AutomationDraft,
): AutomationRequestResult {
  const name = draft.name.trim();
  const schedule = draft.schedule.trim();
  const prompt = draft.prompt.trim();
  const conditionPath = draft.conditionPath.trim();
  const conditionValue = draft.conditionValue.trim();

  if (draft.triggerType === "schedule" && !schedule) {
    return { ok: false, error: "Choose a schedule for this trigger." };
  }
  if (
    draft.conditionType !== "always" &&
    !conditionPathPattern.test(conditionPath)
  ) {
    return {
      ok: false,
      error: "Condition fields use dot notation, such as event.status.",
    };
  }
  if (["equals", "contains"].includes(draft.conditionType) && !conditionValue) {
    return { ok: false, error: "Add a value for this condition." };
  }
  if (draft.actionType !== "webhook" && !prompt) {
    return { ok: false, error: "Add the prompt Doolittle should run." };
  }

  let webhookUrl = "";
  if (draft.actionType === "webhook") {
    try {
      const parsed = new URL(draft.webhookUrl.trim());
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      ) {
        throw new Error("unsupported webhook URL");
      }
      webhookUrl = parsed.toString();
    } catch {
      return {
        ok: false,
        error:
          "Webhook actions need an HTTP or HTTPS URL without embedded credentials.",
      };
    }
  }

  const trigger =
    draft.triggerType === "schedule"
      ? { type: "schedule", schedule }
      : { type: draft.triggerType };
  const condition =
    draft.conditionType === "always"
      ? { type: "always" }
      : {
          type: "payload",
          path: conditionPath,
          operator: draft.conditionType,
          ...(draft.conditionType === "exists"
            ? {}
            : { value: conditionValue }),
        };
  const action =
    draft.actionType === "webhook"
      ? { type: "webhook", method: "POST", url: webhookUrl }
      : { type: draft.actionType, prompt };

  return {
    ok: true,
    payload: {
      name: name || "Untitled automation",
      schedule: schedule || draft.triggerType,
      prompt: prompt || `POST ${webhookUrl}`,
      delivery: "local",
      trigger,
      condition,
      action,
    },
  };
}

export function summarizeAutomation(
  entry: UnknownRecord,
): AutomationDefinitionSummary {
  const trigger = asRecord(entry.trigger);
  const action = asRecord(entry.action);
  const condition = asRecord(entry.condition);
  const legacySchedule = asString(entry.schedule);
  const triggerType = asChoice<AutomationTriggerChoice>(
    trigger.type,
    ["schedule", "manual", "webhook"],
    legacySchedule === "manual" || legacySchedule === "webhook"
      ? legacySchedule
      : "schedule",
  );
  const actionType = asChoice<AutomationActionChoice>(
    action.type,
    ["prompt", "run-agent", "webhook"],
    "prompt",
  );
  const schedule = asString(trigger.schedule, legacySchedule);
  const conditionType = asString(condition.type, "always");
  const conditionOperator = asString(condition.operator);
  const conditionPath = asString(condition.path);
  const token = asString(trigger.token);

  return {
    triggerType,
    triggerLabel:
      triggerType === "schedule"
        ? schedule || "Schedule"
        : triggerType === "webhook"
          ? "Incoming webhook"
          : "Manual only",
    conditionLabel:
      conditionType === "payload"
        ? `${conditionPath || "payload"} ${conditionOperator || "matches"}`
        : "Always",
    actionType,
    actionLabel:
      actionType === "webhook"
        ? `POST ${asString(action.url, "webhook")}`
        : actionType === "run-agent"
          ? "Run Doolittle agent"
          : "Prompt Doolittle",
    ...(token ? { webhookPath: `/cron/webhooks/${token}` } : {}),
  };
}

function asChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && choices.includes(value as T)
    ? (value as T)
    : fallback;
}
