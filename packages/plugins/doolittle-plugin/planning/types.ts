import type {
  PluginStorageBinding,
  StoredPlanRecord,
} from "@doolittle/contracts";

export type { StoredPlanRecord } from "@doolittle/contracts";

export interface PlanningPluginOptions {
  storage: PluginStorageBinding;
}

export interface PlanningStore {
  plans: StoredPlanRecord[];
}
