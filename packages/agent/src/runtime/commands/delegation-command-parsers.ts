export type DelegationSegments = {
  head: string;
  objective: string;
  options: Record<string, string>;
};

export type DelegationSpawnSegments = {
  parentId: string;
  objective: string;
  options: Record<string, string>;
};

export type DelegationFilter = {
  limit?: number;
  concurrency?: number;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  label?: string;
  parentTaskId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode?: "local" | "delegated";
};

function parseOptions(segments: string[]): Record<string, string> {
  return segments.reduce<Record<string, string>>((accumulator, segment) => {
    const separator = segment.indexOf(":");
    if (separator === -1) {
      return accumulator;
    }
    const key = segment.slice(0, separator).trim().toLowerCase();
    const value = segment.slice(separator + 1).trim();
    if (key && value) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

export function parseDelegationSegments(
  raw: string,
): DelegationSegments | null {
  const [left, objective] = raw.split("::").map((part) => part.trim());
  if (!left || !objective) {
    return null;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const [head, ...rawOptions] = segments;
  return {
    head,
    objective,
    options: parseOptions(rawOptions),
  };
}

export function parseDelegationSpawnSegments(
  raw: string,
): DelegationSpawnSegments | null {
  const [left, objective] = raw.split("::").map((part) => part.trim());
  if (!left || !objective) {
    return null;
  }

  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const [parentId, ...rawOptions] = segments;
  return {
    parentId,
    objective,
    options: parseOptions(rawOptions),
  };
}

export function parseDelegationMetadata(
  value?: string,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  const metadata = value
    .split(",")
    .reduce<Record<string, string>>((accumulator, pair) => {
      const [rawKey, rawValue] = pair.split("=").map((part) => part.trim());
      if (rawKey && rawValue) {
        accumulator[rawKey] = rawValue;
      }
      return accumulator;
    }, {});

  return Object.keys(metadata).length ? metadata : undefined;
}

export function parseDelegationLabels(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const labels = value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return labels.length ? labels : [];
}

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
      const status = token.replace("status:", "").trim();
      if (
        ["pending", "running", "completed", "failed", "cancelled"].includes(
          status,
        )
      ) {
        options.status = status as NonNullable<DelegationFilter["status"]>;
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

  if (
    !options.concurrency &&
    !Number.isNaN(Number(raw.trim())) &&
    Number(raw.trim()) > 0
  ) {
    options.concurrency = Number(raw.trim());
    options.limit = Number(raw.trim());
  }

  return options;
}

export function parseRetryPayload(payload: string): {
  id?: string;
  note?: string;
  cascadeChildren: boolean;
} {
  const [left, note] = payload.split("::").map((part) => part.trim());
  const segments = left
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const [id, ...rawOptions] = segments;
  const cascadeChildren = rawOptions.some((segment) => {
    const [key, value] = segment
      .split(":")
      .map((part) => part.trim().toLowerCase());
    return (
      key === "cascade" &&
      (value === "children" || value === "child" || value === "true")
    );
  });

  return {
    id,
    note,
    cascadeChildren,
  };
}
