import type { DelegationFilter } from "./types";

const DELEGATION_STATUSES = new Set<NonNullable<DelegationFilter["status"]>>([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export function parseDelegationFilter(raw: string): DelegationFilter {
  const options: DelegationFilter = {};

  for (const token of raw.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith("limit:") || token.startsWith("concurrency:")) {
      const value = Number(token.replace(/^(limit|concurrency):/u, ""));
      if (!Number.isNaN(value) && value > 0) {
        options.concurrency = value;
        options.limit = value;
      }
      continue;
    }

    if (token.startsWith("group:")) {
      options.group = token.replace("group:", "").trim();
      continue;
    }

    if (token.startsWith("profile:")) {
      options.profile = token.replace("profile:", "").trim();
      continue;
    }

    if (token.startsWith("priority:")) {
      const priority = token.replace("priority:", "").trim();
      if (priority === "low" || priority === "normal" || priority === "high") {
        options.priority = priority;
      }
      continue;
    }

    if (token.startsWith("label:") || token.startsWith("tag:")) {
      options.label = token.replace(/^(label|tag):/u, "").trim();
      continue;
    }

    if (token.startsWith("parent:") || token.startsWith("parentTaskId:")) {
      options.parentTaskId = token
        .replace(/^(parent|parentTaskId):/u, "")
        .trim();
      continue;
    }

    if (token.startsWith("status:")) {
      const status = token.replace("status:", "").trim() as NonNullable<
        DelegationFilter["status"]
      >;
      if (DELEGATION_STATUSES.has(status)) {
        options.status = status;
      }
      continue;
    }

    if (token.startsWith("mode:") || token.startsWith("execution:")) {
      const executionMode = token.replace(/^(mode|execution):/u, "").trim();
      if (executionMode === "local" || executionMode === "delegated") {
        options.executionMode = executionMode;
      }
    }
  }

  const numericValue = Number(raw.trim());
  if (!options.concurrency && !Number.isNaN(numericValue) && numericValue > 0) {
    options.concurrency = numericValue;
    options.limit = numericValue;
  }

  return options;
}
