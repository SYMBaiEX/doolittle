import type { RuntimeModelSettings } from "@doolittle/contracts/model-route";

export type ModelSettings = Partial<RuntimeModelSettings>;

/** The runtime settings document shared by Settings and its model subsection. */
export interface SettingsResponse {
  settings?: Record<string, unknown> & { model?: ModelSettings };
}
