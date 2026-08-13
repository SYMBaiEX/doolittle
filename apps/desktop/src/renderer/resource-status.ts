import type { ApiResource, ApiResourceStatus } from "./lib";

export interface ResourceStatusItem {
  label: string;
  resource: ApiResource<unknown>;
  required?: boolean;
}

export interface ResourceStatusSummary {
  status: ApiResourceStatus;
  required: { total: number; ready: number; pending: number; errors: number };
  optional: { total: number; ready: number; pending: number; errors: number };
  hasData: boolean;
  isValidating: boolean;
}

function statusOf(resource: ApiResource<unknown>): ApiResourceStatus {
  if (resource.status) return resource.status;
  if (resource.loading) return "loading";
  if (resource.error && !resource.data) return "error";
  return resource.data == null ? "disabled" : "ready";
}

export function summarizeResourceStatuses(
  items: readonly ResourceStatusItem[],
): ResourceStatusSummary {
  const groups = {
    required: { total: 0, ready: 0, pending: 0, errors: 0 },
    optional: { total: 0, ready: 0, pending: 0, errors: 0 },
  };
  let hasData = false;
  let isValidating = false;
  let hasLoading = false;
  let hasError = false;
  let hasRefreshing = false;
  let enabled = false;

  for (const item of items) {
    const status = statusOf(item.resource);
    const group = item.required === false ? groups.optional : groups.required;
    group.total += 1;
    if (status !== "disabled") enabled = true;
    if (item.resource.hasData ?? item.resource.data != null) {
      group.ready += 1;
      hasData = true;
    }
    if (status === "loading") {
      group.pending += 1;
      hasLoading = true;
    }
    if (status === "error") {
      group.errors += 1;
      hasError = true;
    }
    if (status === "refreshing") hasRefreshing = true;
    isValidating ||= Boolean(item.resource.isValidating);
  }

  const status = !enabled
    ? "disabled"
    : hasError
      ? "error"
      : hasLoading
        ? "loading"
        : hasRefreshing || isValidating
          ? "refreshing"
          : "ready";
  return { status, ...groups, hasData, isValidating };
}

export function resourceStatusLabel(status: ApiResourceStatus): string {
  return {
    disabled: "Unavailable",
    loading: "Loading",
    ready: "Ready",
    refreshing: "Refreshing",
    error: "Unavailable",
  }[status];
}
