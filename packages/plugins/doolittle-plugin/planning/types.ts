import type {
  PluginStorageOptions,
  StoredPlanRecord,
} from "@doolittle/contracts";

export type { StoredPlanRecord } from "@doolittle/contracts";

export interface PlanningPluginOptions {
  storage?: PluginStorageOptions;
}

export interface PlanningStore {
  plans: StoredPlanRecord[];
}
