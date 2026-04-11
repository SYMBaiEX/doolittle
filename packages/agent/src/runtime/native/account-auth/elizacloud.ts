import type {
  LinkedElizaCloudCredentials,
  LinkedProviderAccountStatus,
} from "./types";

export interface ElizaCloudAuthDependencies {
  commandExists(command: string): boolean;
  getElizaCloudEnvKey():
    | {
        key: string;
        value: string;
      }
    | undefined;
  getStoredElizaCloudCredentials(): LinkedElizaCloudCredentials | undefined;
  isElizaCloudInferenceEnabled(): boolean;
  persistProviderCredentials(
    provider: "elizacloud",
    credentials: LinkedElizaCloudCredentials | undefined,
  ): void;
  resolveCloudApiBaseUrl(baseUrl?: string): string;
}

export function getElizaCloudAccountStatus(
  _homePath: string | undefined,
  dependencies: ElizaCloudAuthDependencies,
): LinkedProviderAccountStatus {
  const cloudInferenceEnabled = dependencies.isElizaCloudInferenceEnabled();
  const stored = dependencies.getStoredElizaCloudCredentials();
  if (stored?.apiKey) {
    return {
      provider: "elizacloud",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: stored.source,
      authMode: stored.authMode ?? "api-key",
      loginCommand: "elizaos login",
      detail: cloudInferenceEnabled
        ? "Eliza Cloud is already connected and active as the managed inference path for this workspace."
        : "Eliza Cloud is already connected from the local Eliza auth store and can be activated as the managed inference path.",
    };
  }

  const envKey = dependencies.getElizaCloudEnvKey();
  if (envKey?.value) {
    return {
      provider: "elizacloud",
      available: true,
      reusable: true,
      nativeReady: true,
      fallbackReady: false,
      source: `env:${envKey.key}`,
      authMode: "api-key",
      loginCommand: "elizaos login",
      detail: cloudInferenceEnabled
        ? "Eliza Cloud is already connected and active for managed inference in this workspace."
        : "Eliza Cloud API key is already configured for this workspace and can be activated as the managed inference path.",
    };
  }

  const cliAvailable = dependencies.commandExists("elizaos");
  return {
    provider: "elizacloud",
    available: cliAvailable,
    reusable: false,
    nativeReady: false,
    fallbackReady: false,
    loginCommand: "elizaos login",
    detail: cliAvailable
      ? "Eliza Cloud is not active yet. Run `elizaos login` from this project to save ELIZAOS_CLOUD_API_KEY."
      : "Eliza Cloud is not active yet, and the `elizaos` CLI was not found on this machine.",
  };
}

export function getLinkedElizaCloudCredentials(
  _homePath: string | undefined,
  dependencies: ElizaCloudAuthDependencies,
): LinkedElizaCloudCredentials | undefined {
  const stored = dependencies.getStoredElizaCloudCredentials();
  if (stored?.apiKey) {
    return stored;
  }

  const envKey = dependencies.getElizaCloudEnvKey();
  if (!envKey?.value) {
    return undefined;
  }

  const resolved = {
    apiKey: envKey.value,
    authMode: "api-key",
    baseUrl: dependencies.resolveCloudApiBaseUrl(
      process.env.ELIZAOS_CLOUD_BASE_URL,
    ),
    source: `env:${envKey.key}`,
  };
  dependencies.persistProviderCredentials("elizacloud", resolved);
  return resolved;
}
