import { createDelegationServiceApi } from "./api";
import type { DelegationServiceApi } from "./api-types";
import { DelegationServiceSupport } from "./support";

export type {
  DelegationAggregationItem,
  DelegationAggregationSummary,
  DelegationOverview,
  DelegationTaskFilter,
  DelegationTaskTree,
  DelegationWorkerStatus,
} from "../read-model";
export type { DelegationSupervisionReport } from "../service-types";

export class DelegationService {
  private readonly support: DelegationServiceSupport;
  readonly list!: DelegationServiceApi["list"];
  readonly listByGroup!: DelegationServiceApi["listByGroup"];
  readonly listByLabel!: DelegationServiceApi["listByLabel"];
  readonly listByProfile!: DelegationServiceApi["listByProfile"];
  readonly create!: DelegationServiceApi["create"];
  readonly spawnChild!: DelegationServiceApi["spawnChild"];
  readonly addNote!: DelegationServiceApi["addNote"];
  readonly get!: DelegationServiceApi["get"];
  readonly pending!: DelegationServiceApi["pending"];
  readonly markRunning!: DelegationServiceApi["markRunning"];
  readonly markWorkerStarted!: DelegationServiceApi["markWorkerStarted"];
  readonly complete!: DelegationServiceApi["complete"];
  readonly fail!: DelegationServiceApi["fail"];
  readonly cancel!: DelegationServiceApi["cancel"];
  readonly requeue!: DelegationServiceApi["requeue"];
  readonly overview!: DelegationServiceApi["overview"];
  readonly workers!: DelegationServiceApi["workers"];
  readonly superviseQueued!: DelegationServiceApi["superviseQueued"];
  readonly executeQueued!: DelegationServiceApi["executeQueued"];
  readonly queueSummary!: DelegationServiceApi["queueSummary"];
  readonly supervise!: DelegationServiceApi["supervise"];
  readonly runQueued!: DelegationServiceApi["runQueued"];
  readonly listChildren!: DelegationServiceApi["listChildren"];
  readonly tree!: DelegationServiceApi["tree"];
  readonly aggregate!: DelegationServiceApi["aggregate"];
  readonly onUpdate!: DelegationServiceApi["onUpdate"];
  readonly getWorkerPaths!: DelegationServiceApi["getWorkerPaths"];

  constructor(baseDir: string) {
    this.support = new DelegationServiceSupport(baseDir);
    Object.assign(this, createDelegationServiceApi(this.support));
  }
}
