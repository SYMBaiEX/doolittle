import type { TrajectoryFilters, TrajectoryMode } from "./shared";

export interface TrajectoryExportOptions extends TrajectoryFilters {
  limit?: number;
  label?: string;
  purpose?: string;
  mode?: TrajectoryMode;
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
  mode?: TrajectoryMode;
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

export interface TrajectoryRlExportInputOptions extends TrajectoryFilters {
  label?: string;
  purpose?: string;
  tags?: string[];
  notes?: string;
  mode?: TrajectoryMode;
  limit?: number;
}
