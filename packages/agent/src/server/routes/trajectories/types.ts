import type { AppContext } from "@/runtime/bootstrap";

export type TrajectoryDatasetBody = {
  limit?: number;
  sessionId?: string;
  role?: "user" | "assistant" | "system";
  label?: string;
  purpose?: string;
  tags?: string[];
  mode?: "dataset" | "research" | "evaluation" | "rl";
  notes?: string;
  startDate?: string;
  endDate?: string;
  scenarioId?: string;
  batchId?: string;
};

export type TrajectoryBundleRecord = {
  manifestPath: string;
  label?: string;
  limit?: number;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
  trainingCompatible?: boolean;
  trainingFormat?: "elizaos-sdk" | "doolittle-debug";
  trainingNotes?: string;
  filters?: {
    sessionId?: string;
    role?: "user" | "assistant" | "system";
  };
};

export type TrajectoryReplayBody = {
  manifestPath?: string;
  label?: string;
  latest?: boolean;
};

export type TrajectoryCompareBody = {
  leftManifestPath?: string;
  rightManifestPath?: string;
};

export type TrajectoryCompressBody = {
  manifestPath?: string;
  sampleCount?: number;
};

export type TrajectoryIngestBody = {
  limit?: number;
  label?: string;
  purpose?: string;
  tags?: string[];
  notes?: string;
};

export type TrajectoryBatchBody = {
  label?: string;
  purpose?: string;
  prompts?: string[];
  rubric?: string[];
  tags?: string[];
};

export type TrajectoryBenchmarkCreateBody = {
  label?: string;
  purpose?: string;
  tags?: string[];
  rubric?: string[];
  group?: string;
  cases?: Array<{ manifestPath?: string; label?: string }>;
};

export type TrajectoryRouteHandler = (
  context: AppContext,
  request: Request,
  url: URL,
) => Promise<Response | null>;
