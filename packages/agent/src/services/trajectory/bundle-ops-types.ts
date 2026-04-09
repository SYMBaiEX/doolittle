import type {
  TrajectoryBundleEntry,
  TrajectoryRecord,
} from "../../types/trajectory";

export type { TrajectoryRecord } from "../../types/trajectory";

export interface TrajectoryBundleOperationsHost {
  baseDir: string;
  slug(value: string): string;
  describeBundle(manifestPath: string): TrajectoryBundleEntry;
  readRecords(dataPath: string): TrajectoryRecord[];
  listBundles(limit: number): TrajectoryBundleEntry[];
}
