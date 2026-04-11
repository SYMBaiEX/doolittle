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

export interface TrajectoryServiceLike {
  exportLatest(): {
    dataPath: string;
    manifestPath: string;
    summaryPath: string;
  };
  listBundles(limit?: number): TrajectoryBundleEntry[];
  compareLatest(): TrajectoryComparisonBundle | undefined;
}
