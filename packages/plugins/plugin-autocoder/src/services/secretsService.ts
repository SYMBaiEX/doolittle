import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { IAgentRuntime } from "@elizaos/core";
import { Service as ElizaService } from "@elizaos/core";
import { nowIso } from "../shared/planning";
import type { SecretStore } from "../shared/types";

export function createSecretsManagerService(storageRootDir: string) {
  class SecretsManagerService extends ElizaService {
    static serviceType = "secrets-manager";
    capabilityDescription =
      "Workspace-native secrets manager for autocoder and deployment workflows.";

    private readonly rootDir = storageRootDir;
    private readonly storePath = join(this.rootDir, "secrets.json");

    constructor(runtime?: IAgentRuntime) {
      super(runtime);
      mkdirSync(this.rootDir, { recursive: true });
      if (!existsSync(this.storePath)) {
        this.writeStore({ secrets: {} });
      }
    }

    static async start(
      runtime?: IAgentRuntime,
    ): Promise<SecretsManagerService> {
      return new SecretsManagerService(runtime);
    }

    async stop(): Promise<void> {}

    getSecret(key: string): string | undefined {
      return this.readStore().secrets[key];
    }

    setSecret(key: string, value: string) {
      const store = this.readStore();
      store.secrets[key] = value;
      this.writeStore(store);
      return {
        key,
        storedAt: nowIso(),
      };
    }

    hasSecret(key: string): boolean {
      return key in this.readStore().secrets;
    }

    listSecretKeys(): string[] {
      return Object.keys(this.readStore().secrets).sort();
    }

    private readStore(): SecretStore {
      try {
        const parsed = JSON.parse(readFileSync(this.storePath, "utf8")) as {
          secrets?: Record<string, string>;
        };
        return {
          secrets:
            parsed.secrets && typeof parsed.secrets === "object"
              ? parsed.secrets
              : {},
        };
      } catch {
        return { secrets: {} };
      }
    }

    private writeStore(store: SecretStore): void {
      writeFileSync(this.storePath, JSON.stringify(store, null, 2), "utf8");
    }
  }

  return SecretsManagerService;
}
