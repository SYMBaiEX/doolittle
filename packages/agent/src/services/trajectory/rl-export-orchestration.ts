import type {
  TrajectoryRecord,
  TrajectoryRlExportInputOptions,
} from "../../types/trajectory";
import { collectTrajectoryRecords } from "./bundle-storage";
import {
  describeTrajectoryRlExport,
  exportTrajectoryRlDataset,
  exportTrajectoryRlReady,
  type TrajectoryRlDatasetOptions,
  type TrajectoryRlReadyOptions,
} from "./rl-export";

type TrajectoryRecordReader = {
  recent(limit: number): TrajectoryRecord[];
};

interface TrajectoryRlExportHost {
  baseDir: string;
  slug(value: string): string;
  sessions: TrajectoryRecordReader & {
    summary(limit: number): {
      totalSessions: number;
    };
  };
}

export interface TrajectoryEvaluationServiceRlExportHost
  extends TrajectoryRlExportHost {}

export function exportTrajectoryEvaluationServiceRlReady(
  host: TrajectoryEvaluationServiceRlExportHost,
  sessionId: string,
  options: TrajectoryRlExportInputOptions & TrajectoryRlReadyOptions = {},
): {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  trainingCompatible: false;
  trainingFormat: "doolittle-rl-v1";
  trainingNotes: string;
} {
  const messages = collectTrajectoryRecords(host, {
    sessionId,
    limit: 500,
    includeEvents: false,
  });
  return exportTrajectoryRlReady({
    baseDir: host.baseDir,
    sessionId,
    messages,
    slug: host.slug,
    options,
  });
}

export function exportTrajectoryEvaluationServiceRlDataset(
  host: TrajectoryEvaluationServiceRlExportHost,
  options: TrajectoryRlExportInputOptions &
    TrajectoryRlDatasetOptions & {
      sessionId?: string;
    } = {},
): {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  sessionCount: number;
  trainingCompatible: false;
  trainingFormat: "doolittle-rl-v1";
  trainingNotes: string;
} {
  const messages = collectTrajectoryRecords(host, {
    limit: options.limit ?? 1000,
    includeEvents: false,
  });
  return exportTrajectoryRlDataset({
    baseDir: host.baseDir,
    messages,
    slug: host.slug,
    options,
  });
}

export function describeTrajectoryEvaluationServiceRlExport(
  host: TrajectoryEvaluationServiceRlExportHost,
): string {
  const { totalSessions } = host.sessions.summary(50);
  return describeTrajectoryRlExport(totalSessions);
}
