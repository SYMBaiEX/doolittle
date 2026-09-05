import type { RuntimeReasoningEffort } from "../../shared/contracts";

export interface ModelSettings {
  provider?: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: RuntimeReasoningEffort;
}

/** The runtime settings document shared by Settings and its model subsection. */
export interface SettingsResponse {
  settings?: Record<string, unknown> & { model?: ModelSettings };
}
