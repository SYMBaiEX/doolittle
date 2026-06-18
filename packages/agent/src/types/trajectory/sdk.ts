// Convenience aliases over the ElizaOS SDK trajectory record types.
//
// As of the 2.0 beta line these records live in `@elizaos/core` (they were
// previously re-exported through `@elizaos/agent/types/trajectory`). The
// `Sdk*` names below preserve the friendlier shape the rest of the Doolittle
// trajectory layer consumes.
import type {
  TrajectoryCacheStatsRecord,
  TrajectoryDetailRecord,
  TrajectoryExportOptions,
  TrajectoryExportResult,
  TrajectoryFlattenedLlmCallRecord,
  TrajectoryListOptions,
  TrajectoryListResult,
  TrajectoryLlmCallRecord,
  TrajectoryProviderAccessRecord,
  TrajectoryStatus,
  TrajectoryStepId,
  TrajectoryStepKind,
  TrajectoryStepRecord,
  TrajectorySummaryRecord,
} from "@elizaos/core";

export type SdkTrajectory = TrajectoryDetailRecord;
export type SdkTrajectoryExportOptions = TrajectoryExportOptions;
export type SdkTrajectoryExportResult = TrajectoryExportResult;
export type SdkTrajectoryListItem = TrajectorySummaryRecord;
export type SdkTrajectoryListOptions = TrajectoryListOptions;
export type SdkTrajectoryListResult = TrajectoryListResult;
export type SdkTrajectoryLlmCall = TrajectoryLlmCallRecord;
export type SdkTrajectoryProviderAccess = TrajectoryProviderAccessRecord;
export type SdkTrajectoryStatus = TrajectoryStatus;
export type SdkTrajectoryStep = TrajectoryStepRecord;
export type SdkTrajectoryStepId = TrajectoryStepId;
export type SdkTrajectoryStepKind = TrajectoryStepKind;
export type SdkTrajectoryCacheStats = TrajectoryCacheStatsRecord;
export type SdkTrajectoryFlattenedLlmCall = TrajectoryFlattenedLlmCallRecord;
