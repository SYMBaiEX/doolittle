export type NoticeKind = "neutral" | "good" | "warn" | "bad";

export type SurfaceNotice = {
  id: number;
  tone: NoticeKind;
  message: string;
  details?: string;
};

export type ConfirmedAction = {
  taskId: string;
  action: "cancel" | "fail";
};

export type ResourceState = {
  error: string;
  loading: boolean;
  reload: () => void;
};

export function normalizeText(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function compactStatus(status?: string): string {
  return status ? status.replaceAll("-", " ") : "pending";
}

export function compactControlValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  if (Array.isArray(value)) return `${value.length}`;
  if (value && typeof value === "object") return "available";
  return "none";
}

export function compactDetailValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object") {
    return normalizeText(JSON.stringify(value), 180);
  }
  return "—";
}

export type TaskAction =
  | "execute"
  | "run"
  | "retry"
  | "cancel"
  | "complete"
  | "fail"
  | "note";

export type TaskCreatePriority = "low" | "normal" | "high" | "";
export type PlanStatus = "draft" | "active" | "completed";
