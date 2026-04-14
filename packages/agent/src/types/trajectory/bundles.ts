import type { TrajectoryGrade, TrajectoryMode, TrajectoryRole } from "./shared";

export interface TrajectoryBundleEntry {
  manifestPath: string;
  dataPath: string;
  summaryPath?: string;
  createdAt: string;
  label: string;
  purpose?: string;
  mode?: TrajectoryMode;
  tags?: string[];
  notes?: string;
  limit: number;
  filters?: {
    sessionId?: string | null;
    role?: TrajectoryRole | null;
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
    role: TrajectoryRole;
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
  focus: TrajectoryMode;
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
  purpose?: string;
  mode?: TrajectoryMode;
  tags?: string[];
}

export interface TrajectoryEvaluationBundle {
  focus: TrajectoryMode;
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  prompt: string;
  highlights: string[];
  purpose?: string;
  mode?: TrajectoryMode;
  tags?: string[];
  score: number;
  grade: TrajectoryGrade;
  findings: string[];
  recommendations: string[];
  evaluationPath: string;
  reportPath: string;
  response?: string;
  responsePath?: string;
}

export interface TrajectoryResearchPackageBundle {
  focus: TrajectoryMode;
  bundle: TrajectoryBundleEntry;
  replay: TrajectoryReplayResult;
  analysis: TrajectoryAnalysisBundle;
  evaluation: TrajectoryEvaluationBundle;
  packageManifestPath: string;
  reportPath: string;
  response?: string;
  responsePath?: string;
  purpose?: string;
  mode?: TrajectoryMode;
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
