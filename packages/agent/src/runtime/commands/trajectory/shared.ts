export type TrajectoryCommandOptions = {
  sessionId?: string;
  role?: "user" | "assistant" | "system";
  limit?: number;
  label?: string;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
  rubric?: string[];
};

export type TrajectoryBenchmarkCaseInput = {
  manifestPath?: string;
  label?: string;
};

export type TrajectoryBundleLike = {
  manifestPath: string;
  label: string;
  createdAt: string;
  messageCount: number;
  sessionCount: number;
  filters?: {
    sessionId?: string | null;
    role?: "user" | "assistant" | "system" | null;
  };
  dataPath?: string;
};

export function parseTrajectoryArgs(raw: string): TrajectoryCommandOptions {
  const options: TrajectoryCommandOptions = {};
  for (const token of raw.split(/\s+/u).filter(Boolean)) {
    if (token.startsWith("session:")) {
      options.sessionId = token.replace("session:", "").trim();
    } else if (token.startsWith("role:")) {
      const role = token.replace("role:", "").trim();
      if (role === "user" || role === "assistant" || role === "system") {
        options.role = role;
      }
    } else if (token.startsWith("limit:")) {
      const limit = Number(token.replace("limit:", "").trim());
      if (!Number.isNaN(limit) && limit > 0) {
        options.limit = limit;
      }
    } else if (token.startsWith("label:")) {
      options.label = token.replace("label:", "").trim();
    } else if (token.startsWith("purpose:")) {
      options.purpose = token.replace("purpose:", "").trim();
    } else if (token.startsWith("mode:")) {
      const mode = token.replace("mode:", "").trim();
      if (
        mode === "dataset" ||
        mode === "research" ||
        mode === "evaluation" ||
        mode === "rl"
      ) {
        options.mode = mode;
      }
    } else if (token.startsWith("tags:") || token.startsWith("tag:")) {
      options.tags = token
        .replace(/^tags?:/u, "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    } else if (token.startsWith("notes:")) {
      options.notes = token.replace("notes:", "").trim();
    } else if (token.startsWith("rubric:")) {
      options.rubric = token
        .replace("rubric:", "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return options;
}

export function parseTrajectoryBenchmarkCases(
  raw: string,
): TrajectoryBenchmarkCaseInput[] {
  return raw
    .split("=>")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (entry.startsWith("manifest:")) {
        return { manifestPath: entry.replace("manifest:", "").trim() };
      }
      if (entry.startsWith("label:")) {
        return { label: entry.replace("label:", "").trim() };
      }
      if (entry.endsWith(".json")) {
        return { manifestPath: entry };
      }
      return { label: entry };
    });
}

export function resolveTrajectoryManifestPath(
  raw: string,
  bundles: TrajectoryBundleLike[],
): string | undefined {
  if (raw.endsWith(".json")) {
    return raw;
  }
  return bundles.find(
    (entry) => entry.label === raw || entry.manifestPath.endsWith(raw),
  )?.manifestPath;
}

export function formatTrajectoryBundleList(
  bundles: TrajectoryBundleLike[],
): string {
  return bundles.length
    ? bundles
        .map(
          (bundle) =>
            `- ${bundle.label} [${bundle.createdAt}] messages=${bundle.messageCount} sessions=${bundle.sessionCount} filters=session:${bundle.filters?.sessionId ?? "any"} role:${bundle.filters?.role ?? "any"}\n  data=${bundle.dataPath}`,
        )
        .join("\n\n")
    : "No trajectory bundles recorded.";
}
