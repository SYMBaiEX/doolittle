export const THREAD_WORKBENCH_STORAGE_PREFIX =
  "doolittle.desktop.thread-workbench.v1";

export const THREAD_WORKBENCH_TABS = [
  "files",
  "changes",
  "terminal",
  "plans",
  "brief",
  "settings",
  "preview",
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
  sessionId: string;
  workspacePath: string;
  workspaceName: string;
  environment: ThreadWorkbenchEnvironment;
  branch: string;
  head: string;
  worktreePath?: string;
  lifecycle: ThreadWorkbenchLifecycle;
  selectedTab: ThreadWorkbenchTab;
  railOpen: boolean;
  railWidth: number;
}

export interface ThreadWorkbenchStateInput {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

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

export const THREAD_WORKBENCH_DEFAULT_WIDTH = 360;
export const THREAD_WORKBENCH_MIN_WIDTH = 292;
export const THREAD_WORKBENCH_MAX_WIDTH = 560;

const LIFECYCLES = new Set<ThreadWorkbenchLifecycle>([
  "idle",
  "active",
  "waiting",
  "completed",
  "failed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWorkbenchTab(value: unknown): value is ThreadWorkbenchTab {
  return (
    typeof value === "string" &&
    THREAD_WORKBENCH_TABS.includes(value as ThreadWorkbenchTab)
  );
}

function isLifecycle(value: unknown): value is ThreadWorkbenchLifecycle {
  return (
    typeof value === "string" &&
    LIFECYCLES.has(value as ThreadWorkbenchLifecycle)
  );
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function workspaceNameFromPath(workspacePath: string): string {
  const normalized = workspacePath.replaceAll("\\", "/").replace(/\/+$/u, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? "Workspace";
}

export function clampThreadWorkbenchWidth(value: number): number {
  if (!Number.isFinite(value)) return THREAD_WORKBENCH_DEFAULT_WIDTH;
  return Math.min(
    THREAD_WORKBENCH_MAX_WIDTH,
    Math.max(THREAD_WORKBENCH_MIN_WIDTH, Math.round(value)),
  );
}

export function threadWorkbenchStorageKey(sessionId: string): string {
  return `${THREAD_WORKBENCH_STORAGE_PREFIX}:${encodeURIComponent(
    sessionId.trim() || "local",
  )}`;
}

export function createThreadWorkbenchState(
  input: ThreadWorkbenchStateInput,
): ThreadWorkbenchState {
  const sessionId = input.sessionId.trim() || "local";
  const workspacePath = input.workspacePath.trim();
  return {
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
    selectedTab: "files",
    railOpen: true,
    railWidth: THREAD_WORKBENCH_DEFAULT_WIDTH,
  };
}

export function parseThreadWorkbenchState(
  value: unknown,
  fallback: ThreadWorkbenchState,
): ThreadWorkbenchState {
  if (!isRecord(value)) return fallback;

  const lifecycle = isLifecycle(value.lifecycle)
    ? value.lifecycle
    : fallback.lifecycle;

  return {
    sessionId: fallback.sessionId,
    workspacePath: fallback.workspacePath,
    workspaceName:
      workspaceNameFromPath(fallback.workspacePath) || fallback.workspaceName,
    environment: "local-v1",
    branch: optionalString(value.branch) ?? fallback.branch,
    head: optionalString(value.head) ?? fallback.head,
    ...(optionalString(value.worktreePath)
      ? { worktreePath: optionalString(value.worktreePath) }
      : fallback.worktreePath
        ? { worktreePath: fallback.worktreePath }
        : {}),
    lifecycle,
    selectedTab: isWorkbenchTab(value.selectedTab)
      ? value.selectedTab
      : fallback.selectedTab,
    railOpen:
      typeof value.railOpen === "boolean" ? value.railOpen : fallback.railOpen,
    railWidth: clampThreadWorkbenchWidth(
      typeof value.railWidth === "number"
        ? value.railWidth
        : fallback.railWidth,
    ),
  };
}

export function loadThreadWorkbenchState(
  input: ThreadWorkbenchStateInput,
  storage?: ThreadWorkbenchStorage,
): ThreadWorkbenchState {
  const fallback = createThreadWorkbenchState(input);
  if (!storage) return fallback;

  try {
    const serialized = storage.getItem(
      threadWorkbenchStorageKey(fallback.sessionId),
    );
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
      threadWorkbenchStorageKey(state.sessionId),
      JSON.stringify({
        ...state,
        railWidth: clampThreadWorkbenchWidth(state.railWidth),
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
