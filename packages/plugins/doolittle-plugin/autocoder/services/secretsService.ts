import { rmSync } from "node:fs";
import { join } from "node:path";

import { readJsonFileSync } from "@elizaos/agent/utils/atomic-json";
import type { IAgentRuntime, Service } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import { createVault, type Vault, VaultMissError } from "@elizaos/vault";
import { nowIso } from "../shared/planning";

type VaultWithClose = Vault & { close?: () => Promise<void> };

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

export function createSecretsManagerService(
  storageRootDir: string,
  vaultFactory: () => Vault = () => createVault({ workDir: storageRootDir }),
) {
  class SecretsManagerService extends ElizaService {
    static serviceType = "secrets-manager";
    capabilityDescription =
      "Eliza Vault adapter for encrypted autocoder and deployment secrets.";

    private readonly vault = vaultFactory() as VaultWithClose;
    private readonly legacyStorePath = join(storageRootDir, "secrets.json");
    private keys = new Set<string>();

    static async start(runtime?: IAgentRuntime): Promise<Service> {
      const service = new SecretsManagerService(runtime);
      await service.initialize();
      return service;
    }

    async stop(): Promise<void> {
      await this.vault.close?.();
    }

    async getSecret(key: string): Promise<string | undefined> {
      try {
        return await this.vault.reveal(key, "doolittle-autocoder");
      } catch (error) {
        if (error instanceof VaultMissError) return undefined;
        throw error;
      }
    }

    async setSecret(key: string, value: string) {
      await this.vault.set(key, value, {
        sensitive: true,
        caller: "doolittle-autocoder",
      });
      this.keys.add(key);
      return {
        key,
        storedAt: nowIso(),
      };
    }

    async hasSecret(key: string): Promise<boolean> {
      return this.vault.has(key);
    }

    listSecretKeys(): string[] {
      return [...this.keys].sort();
    }

    private async initialize(): Promise<void> {
      this.keys = new Set(await this.vault.list());
      const legacy = readLegacySecrets(this.legacyStorePath);
      if (!legacy) return;

      for (const [key, value] of Object.entries(legacy)) {
        if (!(await this.vault.has(key))) {
          await this.vault.set(key, value, {
            sensitive: true,
            caller: "doolittle-legacy-secrets-migration",
          });
        }
      }

      this.keys = new Set(await this.vault.list());
      rmSync(this.legacyStorePath);
    }
  }

  return SecretsManagerService;
}
