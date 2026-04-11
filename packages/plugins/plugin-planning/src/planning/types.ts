import type {
  PluginStorageOptions,
  StoredPlanRecord,
} from "@doolittle/contracts";

export type { StoredPlanRecord } from "@doolittle/contracts";

export interface PlanningPluginOptions {
  delegation: {
    list(): Array<{ id: string }>;
    get?(id: string): unknown;
  };
  workflows: {
    list(limit?: number): Array<{ id: string }>;
    get?(id: string): unknown;
  };
  storage?: PluginStorageOptions;
}

export interface PlanningStore {
  plans: StoredPlanRecord[];
}
