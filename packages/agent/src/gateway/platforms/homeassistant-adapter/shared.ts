import type { EnvConfig } from "@/types/runtime";

export const HOMEASSISTANT_MISSING_DETAIL =
  "HOMEASSISTANT_URL and HOMEASSISTANT_TOKEN are required.";

export const HOMEASSISTANT_STOPPED_DETAIL =
  "HOMEASSISTANT_URL and HOMEASSISTANT_TOKEN should both be configured.";

export const HOMEASSISTANT_STARTED_DETAIL =
  "Home Assistant adapter started with API URL and long-lived token.";

export function HOMEASSISTANT_CONFIGURED_DETAIL(config: EnvConfig): string {
  return `Home Assistant API configured at ${config.homeAssistantUrl}.`;
}
