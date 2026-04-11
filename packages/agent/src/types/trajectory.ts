interface TrajectoryFilters {
  sessionId?: string;
  role?: "user" | "assistant" | "system";
}

export interface TrajectoryExportOptions extends TrajectoryFilters {
  limit?: number;
  label?: string;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
  rubric?: string[];
}

export interface TrajectoryBenchmarkCaseInput {
  manifestPath?: string;
  label?: string;
  purpose?: string;
  tags?: string[];
  rubric?: string[];
  notes?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
}

export interface TrajectoryRlReadyOptions {
  label?: string;
  model?: string;
  provider?: string;
  agentName?: string;
  windowSize?: number;
  includeMetadata?: boolean;
}

export interface TrajectoryRlDatasetOptions {
  label?: string;
  model?: string;
  provider?: string;
  agentName?: string;
  windowSize?: number;
}

export interface TrajectoryRlExportInputOptions {
  label?: string;
  purpose?: string;
  tags?: string[];
  notes?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  limit?: number;
  sessionId?: string;
  role?: "user" | "assistant" | "system";
}

export interface TrajectoryRecord {
  sessionId: string;
  createdAt: string;
  role: "user" | "assistant" | "system";
  text: string;
}

export interface GatewayTraceLike {
  at: string;
  kind: string;
  platform: string;
  detail: string;
  sessionId?: string;
  userId?: string;
  roomId?: string;
}

export interface GatewayMessageLike {
  at: string;
  platform: string;
  userId?: string;
  roomId?: string;
  sessionId?: string;
  text?: string;
  detail?: string;
  status?: string;
}

export interface TrajectoryBundleEntry {
  manifestPath: string;
  dataPath: string;
  summaryPath?: string;
  createdAt: string;
  label: string;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  notes?: string;
  limit: number;
  filters?: {
    sessionId?: string | null;
    role?: "user" | "assistant" | "system" | null;
  };
  messageCount: number;
  sessionCount: number;
  sessions: string[];
  roleCounts: Record<string, number>;
}

export interface TrajectoryReplayResult extends TrajectoryBundleEntry {
  replayPath: string;
  replaySummaryPath: string;
  replayCount: number;
  replayPreview: Array<{
    sessionId: string;
    createdAt: string;
    role: "user" | "assistant" | "system";
    text: string;
  }>;
}

export interface TrajectoryCompressionBundle {
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  compressedPath: string;
  reportPath: string;
  sampleCount: number;
  sessionBlocks: Array<{
    sessionId: string;
    turns: number;
    preview: string[];
  }>;
  findings: string[];
}

export interface TrajectoryComparisonBundle {
  left: TrajectoryBundleEntry;
  right: TrajectoryBundleEntry;
  leftReplay: TrajectoryReplayResult;
  rightReplay: TrajectoryReplayResult;
  reportPath: string;
  summaryPath: string;
  messageDelta: number;
  sessionDelta: number;
  roleDelta: Record<string, number>;
  findings: string[];
  recommendation: string;
}

export interface TrajectoryAnalysisBundle {
  focus: "dataset" | "research" | "evaluation" | "rl";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
}

export interface TrajectoryEvaluationBundle {
  focus: "dataset" | "research" | "rl" | "evaluation";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: string[];
  recommendations: string[];
  evaluationPath: string;
  reportPath: string;
  response?: string;
  responsePath?: string;
}

export interface TrajectoryResearchPackageBundle {
  focus: "dataset" | "research" | "rl" | "evaluation";
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  analysis: TrajectoryAnalysisBundle;
  evaluation: TrajectoryEvaluationBundle;
  packageManifestPath: string;
  reportPath: string;
  response?: string;
  responsePath?: string;
  purpose?: string;
  mode?: "dataset" | "research" | "evaluation" | "rl";
  tags?: string[];
}

export interface TrajectoryGatewayIngestBundle {
  dataPath: string;
  manifestPath: string;
  summaryPath: string;
  messageCount: number;
  sessionCount: number;
  traceCount: number;
  inboxCount: number;
  outboxCount: number;
}

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
  mode?: "dataset" | "research" | "evaluation" | "rl";
}

export interface TrajectoryBenchmarkEnvironmentSummary {
  provider: "openai" | "anthropic" | "offline";
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
  grade: "A" | "B" | "C" | "D" | "F";
  findings: string[];
  recommendations: string[];
  reportPath: string;
}

export interface TrajectoryModelContext {
  provider: "openai" | "anthropic" | "offline";
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
}
