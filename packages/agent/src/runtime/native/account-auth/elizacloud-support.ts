import { resolveCloudApiBaseUrl } from "@elizaos/agent/cloud/base-url";
import { commandExists } from "./shared";
import {
  getStoredElizaCloudCredentials,
  persistProviderCredentials,
} from "./store";
import type { LinkedElizaCloudCredentials } from "./types";

export function getElizaCloudEnvKey():
  | {
      key: string;
      value: string;
    }
  | undefined {
  for (const key of ["ELIZAOS_CLOUD_API_KEY", "ELIZA_CLOUD_API_KEY"] as const) {
    const value = process.env[key]?.trim();
    if (value) {
      return { key, value };
    }
  }
  return undefined;
}

export function isElizaCloudInferenceEnabled(): boolean {
  const value = process.env.ELIZAOS_CLOUD_ENABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

export function getElizaCloudAuthDependencies() {
  return {
    commandExists,
    getElizaCloudEnvKey,
    getStoredElizaCloudCredentials,
    isElizaCloudInferenceEnabled,
    persistProviderCredentials: (
      provider: "elizacloud",
      credentials: LinkedElizaCloudCredentials | undefined,
    ) => persistProviderCredentials(provider, credentials),
    resolveCloudApiBaseUrl,
  };
}
