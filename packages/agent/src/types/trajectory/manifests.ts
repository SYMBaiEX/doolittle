import type {
  TrajectoryComparisonBundle,
  TrajectoryEvaluationBundle,
  TrajectoryReplayResult,
} from "./bundles";
import type {
  TrajectoryBenchmarkCaseInput,
  TrajectoryExportOptions,
  TrajectoryRlDatasetOptions,
  TrajectoryRlExportInputOptions,
  TrajectoryRlReadyOptions,
} from "./export";
import type {
  TrajectoryGrade,
  TrajectoryMode,
  TrajectoryProvider,
} from "./shared";

export type {
  TrajectoryBenchmarkCaseInput,
  TrajectoryExportOptions,
  TrajectoryRlDatasetOptions,
  TrajectoryRlExportInputOptions,
  TrajectoryRlReadyOptions,
};

export interface TrajectoryBatchManifest {
  manifestPath: string;
  summaryPath: string;
  createdAt: string;
  label: string;
  purpose: string;
  prompts: string[];
  tags: string[];
  rubric: string[];
  taskIds: string[];
  group: string;
}

export interface TrajectoryBenchmarkCase {
  manifestPath: string;
  label: string;
  purpose?: string;
  tags?: string[];
  rubric?: string[];
  notes?: string;
  mode?: TrajectoryMode;
}

export interface TrajectoryBenchmarkEnvironmentSummary {
  provider: TrajectoryProvider;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  bundleCount: number;
  latestBundleLabel?: string;
  latestBundleCreatedAt?: string;
  canEvaluate: boolean;
  canPackage: boolean;
}

export interface TrajectoryBenchmarkManifest {
  manifestPath: string;
  summaryPath: string;
  createdAt: string;
  label: string;
  purpose: string;
  tags: string[];
  rubric: string[];
  cases: TrajectoryBenchmarkCase[];
  group: string;
  environment: TrajectoryBenchmarkEnvironmentSummary;
}

export interface TrajectoryBenchmarkCaseResult {
  case: TrajectoryBenchmarkCase;
  replay: TrajectoryReplayResult;
  evaluation: TrajectoryEvaluationBundle;
  comparison?: TrajectoryComparisonBundle;
}

export interface TrajectoryBenchmarkRun {
  manifestPath: string;
  summaryPath: string;
  createdAt: string;
  label: string;
  purpose: string;
  group: string;
  environment: TrajectoryBenchmarkEnvironmentSummary;
  cases: TrajectoryBenchmarkCaseResult[];
  averageScore: number;
  bestScore: number;
  worstScore: number;
  grade: TrajectoryGrade;
  findings: string[];
  recommendations: string[];
  reportPath: string;
}

export interface TrajectoryModelContext {
  provider: TrajectoryProvider;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
}
