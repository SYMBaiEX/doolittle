import type { DelegationTaskRecord } from "@/types";
import type {
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationTaskFilter,
  DelegationTaskTree,
  DelegationWorkerStatus,
} from "../read-model";
import type {
  DelegationCreateInput,
  DelegationExecutionOptions,
  DelegationSupervisionOptions,
  DelegationSupervisionReport,
  DelegationWorkerStartInput,
} from "../service-types";
import type { DelegationUpdateEvent } from "../utils";

export type DelegationTaskRunner = (
  task: DelegationTaskRecord,
) => Promise<string>;

export interface DelegationServiceReadFacade {
  list(filter?: DelegationTaskFilter): DelegationTaskRecord[];
  listByGroup(group: string): DelegationTaskRecord[];
  listByLabel(label: string): DelegationTaskRecord[];
  listByProfile(profile: string): DelegationTaskRecord[];
  get(id: string): DelegationTaskRecord;
  pending(filter?: DelegationTaskFilter): DelegationTaskRecord[];
  overview(): DelegationOverview;
  workers(
    limit?: number,
    filter?: DelegationTaskFilter,
  ): DelegationWorkerStatus[];
  listChildren(parentTaskId: string): DelegationTaskRecord[];
  tree(id: string): DelegationTaskTree;
  aggregate(id: string): DelegationAggregationSummary;
}

export interface DelegationServiceMutationFacade {
  create(input: DelegationCreateInput): DelegationTaskRecord;
  spawnChild(
    parentId: string,
    input: Omit<DelegationCreateInput, "parentTaskId">,
  ): DelegationTaskRecord;
  addNote(id: string, note: string): DelegationTaskRecord;
  markRunning(id: string): DelegationTaskRecord;
  markWorkerStarted(
    id: string,
    worker: DelegationWorkerStartInput,
  ): DelegationTaskRecord;
  complete(id: string, note?: string): DelegationTaskRecord;
  fail(
    id: string,
    note: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord;
  cancel(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord;
  requeue(
    id: string,
    note?: string,
    options?: { cascadeChildren?: boolean },
  ): DelegationTaskRecord;
}

export interface DelegationServiceQueueFacade {
  superviseQueued(
    runner: DelegationTaskRunner,
    options?: DelegationSupervisionOptions,
  ): Promise<DelegationSupervisionReport>;
  executeQueued(
    runner: DelegationTaskRunner,
    options?: DelegationExecutionOptions,
  ): Promise<DelegationTaskRecord[]>;
  queueSummary(): DelegationOverview;
  supervise(
    runner: DelegationTaskRunner,
    options?: DelegationSupervisionOptions,
  ): Promise<DelegationSupervisionReport>;
  runQueued(
    runner: DelegationTaskRunner,
    options?: DelegationExecutionOptions,
  ): Promise<DelegationTaskRecord[]>;
}

export interface DelegationServiceApi
  extends DelegationServiceReadFacade,
    DelegationServiceMutationFacade,
    DelegationServiceQueueFacade {
  onUpdate(listener: (event: DelegationUpdateEvent) => void): () => void;
  getWorkerPaths(id: string): { inputPath: string; outputPath: string };
}
