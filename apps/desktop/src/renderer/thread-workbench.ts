import { asArray, asRecord, asString, isPlainObject } from "./value-guards";

export const THREAD_WORKBENCH_STORAGE_PREFIX =
  "doolittle.desktop.thread-workbench.v2";

export const THREAD_WORKBENCH_TABS = [
  "files",
  "changes",
  "terminal",
  "preview",
  "plans",
  "brief",
  "settings",
] as const;

export type ThreadWorkbenchTab = (typeof THREAD_WORKBENCH_TABS)[number];
export type ThreadWorkbenchEnvironment = "local-v1";
export type ThreadWorkbenchLifecycle =
  | "idle"
  | "active"
  | "waiting"
  | "completed"
  | "failed";

export interface ThreadWorkbenchState {
  botId: string;
  sessionId: string;
  workspacePath: string;
  workspaceName: string;
  environment: ThreadWorkbenchEnvironment;
  branch: string;
  head: string;
  worktreePath?: string;
  lifecycle: ThreadWorkbenchLifecycle;
  selectedFile: string;
  selectedChange: string;
  selectedCommand: string;
}

export interface ThreadWorkbenchStateInput {
  botId?: string;
  sessionId: string;
  workspacePath: string;
  workspaceName?: string;
  branch?: string;
  head?: string;
  worktreePath?: string;
  lifecycle?: ThreadWorkbenchLifecycle;
}

export interface ThreadWorkbenchStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BriefPlanSummary {
  id: string;
  title: string;
  objective: string;
  status: string;
  nextStep: string;
  stepCount: number;
}

export interface BriefPlanSelection {
  activePlan: BriefPlanSummary | null;
  draftCount: number;
}

const UNAVAILABLE_VALUE = "Unavailable";

function normalizePlanStep(plan: Record<string, unknown>): string {
  const steps = asArray(plan.steps)
    .map((step) => asString(step).trim())
    .filter(Boolean);
  if (steps.length > 0) {
    return steps[0];
  }
  return UNAVAILABLE_VALUE;
}

export function buildBriefPlanSummary(
  plans: readonly unknown[],
): BriefPlanSelection {
  const normalized = plans
    .map((entry) => asRecord(entry))
    .map((entry, index) => ({
      id: asString(entry.id, `plan-${index}`),
      title: asString(entry.title, "Untitled plan"),
      objective: asString(entry.objective, UNAVAILABLE_VALUE),
      status: asString(entry.status, "unknown"),
      steps: asArray(entry.steps),
      updatedAt: asString(entry.updatedAt),
    }))
    .filter((entry) => entry.status || entry.title || entry.objective);

  const active =
    normalized.find((entry) => entry.status === "active") ??
    normalized.find((entry) => entry.status === "draft");

  const draftCount = normalized.filter(
    (entry) => entry.status === "draft",
  ).length;

  return {
    activePlan: active
      ? {
          id: active.id,
          title: active.title || UNAVAILABLE_VALUE,
          objective: active.objective || UNAVAILABLE_VALUE,
          status: active.status || "unknown",
          nextStep: normalizePlanStep(active),
          stepCount: active.steps.length,
        }
      : null,
    draftCount,
  };
}

export function workspaceNameFromPath(workspacePath: string): string {
  const normalized = workspacePath.replaceAll("\\", "/").replace(/\/+$/u, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? "Workspace";
}

export function threadWorkbenchStorageKey(
  input: ThreadWorkbenchStateInput,
): string {
  return `${THREAD_WORKBENCH_STORAGE_PREFIX}:${JSON.stringify([
    input.botId?.trim() || "",
    input.sessionId.trim() || "local",
    input.workspacePath.trim(),
  ])}`;
}

export function createThreadWorkbenchState(
  input: ThreadWorkbenchStateInput,
): ThreadWorkbenchState {
  const sessionId = input.sessionId.trim() || "local";
  const workspacePath = input.workspacePath.trim();
  return {
    botId: input.botId?.trim() || "",
    sessionId,
    workspacePath,
    workspaceName:
      input.workspaceName?.trim() ||
      workspaceNameFromPath(workspacePath) ||
      "Workspace",
    environment: "local-v1",
    branch: input.branch?.trim() || "",
    head: input.head?.trim() || "",
    ...(input.worktreePath?.trim()
      ? { worktreePath: input.worktreePath.trim() }
      : {}),
    lifecycle: input.lifecycle ?? "idle",
    selectedFile: "",
    selectedChange: "",
    selectedCommand: "",
  };
}

export function parseThreadWorkbenchState(
  value: unknown,
  fallback: ThreadWorkbenchState,
): ThreadWorkbenchState {
  if (!isPlainObject(value)) return fallback;
  // Legacy session-only records have no trustworthy bot/workspace ownership.
  if (
    value.botId !== fallback.botId ||
    value.sessionId !== fallback.sessionId ||
    value.workspacePath !== fallback.workspacePath
  )
    return fallback;
  return {
    ...fallback,
    // Repository and execution facts are fresh data, not saved presentation.
    selectedFile:
      typeof value.selectedFile === "string" ? value.selectedFile : "",
    selectedChange:
      typeof value.selectedChange === "string" ? value.selectedChange : "",
    selectedCommand:
      typeof value.selectedCommand === "string" ? value.selectedCommand : "",
  };
}

export function loadThreadWorkbenchState(
  input: ThreadWorkbenchStateInput,
  storage?: ThreadWorkbenchStorage,
): ThreadWorkbenchState {
  const fallback = createThreadWorkbenchState(input);
  if (!storage) return fallback;

  try {
    const serialized = storage.getItem(threadWorkbenchStorageKey(fallback));
    if (!serialized) return fallback;
    return parseThreadWorkbenchState(JSON.parse(serialized), fallback);
  } catch {
    return fallback;
  }
}

export function saveThreadWorkbenchState(
  state: ThreadWorkbenchState,
  storage?: ThreadWorkbenchStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      threadWorkbenchStorageKey(state),
      JSON.stringify({
        botId: state.botId,
        sessionId: state.sessionId,
        workspacePath: state.workspacePath,
        selectedFile: state.selectedFile,
        selectedChange: state.selectedChange,
        selectedCommand: state.selectedCommand,
      }),
    );
  } catch {
    // Storage can be unavailable in private/locked-down renderer contexts.
  }
}

export function browserThreadWorkbenchStorage():
  | ThreadWorkbenchStorage
  | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
