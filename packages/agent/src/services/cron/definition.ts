import { randomUUID } from "node:crypto";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  CronJobRecord,
} from "@/types";
import type {
  AutomationExecutionContext,
  AutomationTriggerInput,
  CreateCronJobInput,
} from "./types";

const conditionPathPattern = /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/iu;

export function buildAutomationDefinition(input: CreateCronJobInput): {
  trigger: AutomationTrigger;
  condition: AutomationCondition;
  action: AutomationAction;
  schedule: string;
  prompt: string;
} {
  const trigger = normalizeAutomationTrigger(input.trigger, input.schedule);
  const action = normalizeAutomationAction(input.action, input.prompt);
  const condition = normalizeAutomationCondition(input.condition);

  return {
    trigger,
    condition,
    action,
    schedule: trigger.type === "schedule" ? trigger.schedule : trigger.type,
    prompt: action.type === "webhook" ? `POST ${action.url}` : action.prompt,
  };
}

export function hydrateAutomationJob(job: CronJobRecord): CronJobRecord {
  const trigger =
    job.trigger ??
    normalizeAutomationTrigger(
      job.schedule === "manual" || job.schedule === "webhook"
        ? { type: job.schedule }
        : undefined,
      job.schedule,
    );
  const action = job.action ?? normalizeAutomationAction(undefined, job.prompt);

  return {
    ...job,
    trigger,
    condition: normalizeAutomationCondition(job.condition),
    action,
  };
}

export function normalizeAutomationTrigger(
  trigger: AutomationTriggerInput | undefined,
  legacySchedule?: string,
  existing?: AutomationTrigger,
): AutomationTrigger {
  const resolved =
    trigger ??
    (legacySchedule?.trim()
      ? { type: "schedule" as const, schedule: legacySchedule }
      : undefined);
  if (!resolved) {
    throw new Error("An automation trigger is required.");
  }

  if (!["schedule", "manual", "webhook"].includes(resolved.type)) {
    throw new Error(
      `Unsupported automation trigger "${String(resolved.type)}".`,
    );
  }
  if (resolved.type === "schedule") {
    const schedule =
      typeof resolved.schedule === "string" ? resolved.schedule.trim() : "";
    if (!schedule) {
      throw new Error("Scheduled automations require a schedule.");
    }
    return { type: "schedule", schedule };
  }
  if (resolved.type === "manual") {
    return { type: "manual" };
  }
  return {
    type: "webhook",
    token:
      (typeof resolved.token === "string" ? resolved.token.trim() : "") ||
      (existing?.type === "webhook" ? existing.token : randomUUID()),
  };
}

export function normalizeAutomationCondition(
  condition?: AutomationCondition,
): AutomationCondition {
  if (!condition) {
    return { type: "always" };
  }
  if (!["always", "payload"].includes(condition.type)) {
    throw new Error(
      `Unsupported automation condition "${String(condition.type)}".`,
    );
  }
  if (condition.type === "always") {
    return { type: "always" };
  }

  if (!["exists", "equals", "contains"].includes(condition.operator)) {
    throw new Error(
      `Unsupported payload condition "${String(condition.operator)}".`,
    );
  }
  const path = typeof condition.path === "string" ? condition.path.trim() : "";
  if (!conditionPathPattern.test(path)) {
    throw new Error("Payload conditions require a dot-separated field path.");
  }
  const value =
    typeof condition.value === "string" ? condition.value.trim() : undefined;
  if (condition.operator !== "exists" && !value) {
    throw new Error(
      `The ${condition.operator} condition requires a comparison value.`,
    );
  }
  return {
    type: "payload",
    path,
    operator: condition.operator,
    ...(value ? { value } : {}),
  };
}

export function normalizeAutomationAction(
  action: AutomationAction | undefined,
  legacyPrompt?: string,
): AutomationAction {
  const resolved =
    action ??
    (legacyPrompt?.trim()
      ? { type: "prompt" as const, prompt: legacyPrompt }
      : undefined);
  if (!resolved) {
    throw new Error("An automation action is required.");
  }

  if (!["prompt", "run-agent", "webhook"].includes(resolved.type)) {
    throw new Error(
      `Unsupported automation action "${String(resolved.type)}".`,
    );
  }
  if (resolved.type === "webhook") {
    if (resolved.method !== "POST") {
      throw new Error("Webhook actions currently support POST only.");
    }
    const url = parseWebhookUrl(
      typeof resolved.url === "string" ? resolved.url : "",
    );
    return { type: "webhook", url, method: "POST" };
  }

  const prompt =
    typeof resolved.prompt === "string" ? resolved.prompt.trim() : "";
  if (!prompt) {
    throw new Error(`${resolved.type} actions require a prompt.`);
  }
  return { type: resolved.type, prompt };
}

export function automationTriggerMatches(
  job: CronJobRecord,
  source: AutomationExecutionContext["source"],
): boolean {
  const trigger = hydrateAutomationJob(job).trigger;
  if (!trigger) {
    return false;
  }
  if (source === "manual") {
    return true;
  }
  return trigger.type === source;
}

export function evaluateAutomationCondition(
  condition: AutomationCondition | undefined,
  payload: Record<string, unknown> | undefined,
): { matched: boolean; detail: string } {
  const normalized = normalizeAutomationCondition(condition);
  if (normalized.type === "always") {
    return { matched: true, detail: "No condition configured." };
  }

  const value = readPayloadPath(payload, normalized.path);
  if (normalized.operator === "exists") {
    const matched = value !== undefined && value !== null;
    return {
      matched,
      detail: matched
        ? `${normalized.path} exists.`
        : `${normalized.path} was not present.`,
    };
  }

  const actual = value === undefined || value === null ? "" : String(value);
  const expected = normalized.value ?? "";
  const matched =
    normalized.operator === "equals"
      ? actual === expected
      : actual.includes(expected);
  return {
    matched,
    detail: matched
      ? `${normalized.path} ${normalized.operator} the configured value.`
      : `${normalized.path} did not ${normalized.operator} the configured value.`,
  };
}

function readPayloadPath(
  payload: Record<string, unknown> | undefined,
  path: string,
): unknown {
  let current: unknown = payload;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function parseWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Webhook actions require a valid HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Webhook actions require an HTTP or HTTPS URL without embedded credentials.",
    );
  }
  return url.toString();
}
