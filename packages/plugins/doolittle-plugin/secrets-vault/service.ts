import { rmSync } from "node:fs";
import { join } from "node:path";

import { DOOLITTLE_SECRETS_VAULT_SERVICE } from "@doolittle/contracts";
import { readJsonFileSync } from "@elizaos/agent/utils/atomic-json";
import {
  Service as ElizaService,
  type IAgentRuntime,
  SECRETS_SERVICE_TYPE,
  type Service,
} from "@elizaos/core";
import { createVault, type Vault } from "@elizaos/vault";

type VaultWithClose = Vault & { close?: () => Promise<void> };

type GlobalSecretContext = {
  level: "global";
  agentId: IAgentRuntime["agentId"];
};

const SECRET_CONFIG_KEY_PREFIX = "__doolittle_eliza_secret_config__/";

type PersistedSecretConfig = Record<string, unknown>;

interface ElizaSecretsService {
  getGlobal(key: string): Promise<string | null>;
  setGlobal(
    key: string,
    value: string,
    config?: PersistedSecretConfig,
  ): Promise<boolean>;
  getConfig(
    key: string,
    context: GlobalSecretContext,
  ): Promise<PersistedSecretConfig | null>;
  list(context: GlobalSecretContext): Promise<Record<string, unknown>>;
  onAnySecretChanged(
    callback: (
      key: string,
      value: string | null,
      context: { level: "global" | "world" | "user" },
    ) => Promise<void>,
  ): () => void;
}

function readLegacySecrets(path: string): Record<string, string> | undefined {
  const parsed = readJsonFileSync<{ secrets?: unknown }>(path);
  if (!parsed?.secrets || typeof parsed.secrets !== "object") {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(parsed.secrets).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && Boolean(entry[0].trim()),
    ),
  );
}

/**
 * Persist Eliza's global secrets through the official encrypted Vault package.
 *
 * Eliza remains the sole runtime API and owns global/world/user semantics,
 * validation, access logging, and change events. This product service only
 * hydrates the global store on startup, mirrors global changes durably, and
 * imports the retired plaintext store once.
 */
export function createSecretsVaultPersistenceService(
  storageRootDir: string,
  vaultFactory: () => Vault = () => createVault({ workDir: storageRootDir }),
) {
  class SecretsVaultPersistenceService extends ElizaService {
    static serviceType = DOOLITTLE_SECRETS_VAULT_SERVICE;
    capabilityDescription =
      "Durable Eliza global-secret persistence through the official encrypted Vault package.";

    private readonly vault = vaultFactory() as VaultWithClose;
    private readonly legacyStorePath = join(storageRootDir, "secrets.json");
    private unsubscribeFromEliza?: () => void;

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      if (!runtime) {
        throw new Error(
          "Eliza runtime is required for secrets vault persistence.",
        );
      }
      const service = new SecretsVaultPersistenceService(runtime);
      await service.initialize(runtime);
      return service;
    }

    async stop(): Promise<void> {
      this.unsubscribeFromEliza?.();
      this.unsubscribeFromEliza = undefined;
      await this.vault.close?.();
    }

    /**
     * Implements Eliza's external-vault mirror contract. Runtime callers use
     * the native SECRETS service directly; this method writes only the mirror.
     */
    async setSecret(key: string, value: string): Promise<boolean> {
      await this.persistSecret(key, value, "eliza-secrets-mirror");
      return true;
    }

    private async initialize(runtime: IAgentRuntime): Promise<void> {
      await this.importLegacySecrets();

      const secrets = (await runtime.getServiceLoadPromise(
        SECRETS_SERVICE_TYPE,
      )) as unknown as ElizaSecretsService;
      await this.reconcileGlobalSecrets(runtime, secrets);

      this.unsubscribeFromEliza = secrets.onAnySecretChanged(
        async (key, value, context) => {
          if (context.level !== "global") return;
          if (value === null) {
            await this.vault.remove(key);
            await this.vault.remove(this.configKey(key));
            return;
          }
          await this.persistNativeSecret(
            runtime,
            secrets,
            key,
            value,
            "eliza-secrets-change",
          );
        },
      );
    }

    private async reconcileGlobalSecrets(
      runtime: IAgentRuntime,
      secrets: ElizaSecretsService,
    ): Promise<void> {
      const nativeMetadata = await secrets.list({
        level: "global",
        agentId: runtime.agentId,
      });
      const nativeKeys = new Set(Object.keys(nativeMetadata));
      const vaultKeys = (await this.vault.list()).filter(
        (key) => !key.startsWith(SECRET_CONFIG_KEY_PREFIX),
      );

      // The active Eliza runtime wins when both stores already contain a key.
      // Otherwise hydrate Eliza from Vault so restarts preserve global secrets.
      for (const key of nativeKeys) {
        const value = await secrets.getGlobal(key);
        if (value !== null) {
          await this.persistNativeSecret(
            runtime,
            secrets,
            key,
            value,
            "eliza-secrets-reconcile",
          );
        }
      }

      for (const key of vaultKeys) {
        if (nativeKeys.has(key)) continue;
        const value = await this.vault.reveal(key, "eliza-secrets-hydration");
        const config = await this.readPersistedConfig(key);
        await secrets.setGlobal(key, value, config ?? undefined);
      }
    }

    private async importLegacySecrets(): Promise<void> {
      const legacy = readLegacySecrets(this.legacyStorePath);
      if (!legacy) return;

      for (const [key, value] of Object.entries(legacy)) {
        if (!(await this.vault.has(key))) {
          await this.persistSecret(
            key,
            value,
            "doolittle-legacy-secrets-migration",
          );
        }
      }

      rmSync(this.legacyStorePath);
    }

    private async persistSecret(
      key: string,
      value: string,
      caller: string,
    ): Promise<void> {
      await this.vault.set(key, value, {
        sensitive: true,
        caller,
      });
    }

    private async persistNativeSecret(
      runtime: IAgentRuntime,
      secrets: ElizaSecretsService,
      key: string,
      value: string,
      caller: string,
    ): Promise<void> {
      await this.persistSecret(key, value, caller);
      const config = await secrets.getConfig(key, {
        level: "global",
        agentId: runtime.agentId,
      });
      if (!config) {
        await this.vault.remove(this.configKey(key));
        return;
      }
      await this.vault.set(this.configKey(key), JSON.stringify(config), {
        sensitive: false,
        caller,
      });
    }

    private async readPersistedConfig(
      key: string,
    ): Promise<PersistedSecretConfig | null> {
      const configKey = this.configKey(key);
      if (!(await this.vault.has(configKey))) return null;
      const serialized = await this.vault.get(configKey);
      try {
        const parsed = JSON.parse(serialized) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as PersistedSecretConfig)
          : null;
      } catch {
        return null;
      }
    }

    private configKey(key: string): string {
      return `${SECRET_CONFIG_KEY_PREFIX}${key}`;
    }
  }

  return SecretsVaultPersistenceService;
}
