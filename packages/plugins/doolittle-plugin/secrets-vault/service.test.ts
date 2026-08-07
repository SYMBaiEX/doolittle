import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SECRETS_SERVICE_TYPE, type UUID } from "@elizaos/core";
import { createVault, inMemoryMasterKey } from "@elizaos/vault";
import { afterEach, describe, expect, it } from "vitest";
import { createSecretsVaultPersistenceService } from "./service";

const roots: string[] = [];
const agentId = "00000000-0000-4000-8000-000000000001" as UUID;

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createTestService(root: string) {
  return createSecretsVaultPersistenceService(root, () =>
    createVault({
      workDir: root,
      masterKey: inMemoryMasterKey(Buffer.alloc(32, 7)),
    }),
  );
}

function createElizaSecrets(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const configs = new Map<string, Record<string, unknown>>();
  const callbacks = new Set<
    (
      key: string,
      value: string | null,
      context: { level: "global" },
    ) => Promise<void>
  >();

  return {
    values,
    async getGlobal(key: string) {
      return values.get(key) ?? null;
    },
    configs,
    async setGlobal(
      key: string,
      value: string,
      config: Record<string, unknown> = {},
    ) {
      values.set(key, value);
      configs.set(key, config);
      for (const callback of callbacks) {
        await callback(key, value, { level: "global" });
      }
      return true;
    },
    async deleteGlobal(key: string) {
      values.delete(key);
      for (const callback of callbacks) {
        await callback(key, null, { level: "global" });
      }
    },
    async list() {
      return Object.fromEntries([...values.keys()].map((key) => [key, {}]));
    },
    async getConfig(key: string) {
      return configs.get(key) ?? {};
    },
    onAnySecretChanged(
      callback: typeof callbacks extends Set<infer T> ? T : never,
    ) {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
  };
}

function createRuntime(secrets: ReturnType<typeof createElizaSecrets>) {
  return {
    agentId,
    async getServiceLoadPromise(serviceType: string) {
      if (serviceType !== SECRETS_SERVICE_TYPE) {
        throw new Error(`unexpected service: ${serviceType}`);
      }
      return secrets;
    },
  };
}

describe("Eliza secrets Vault persistence", () => {
  it("persists native global changes and hydrates them after restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-vault-"));
    roots.push(root);
    const Service = createTestService(root);
    const firstSecrets = createElizaSecrets();
    const first = (await Service.start(
      createRuntime(firstSecrets) as never,
    )) as InstanceType<typeof Service>;

    await firstSecrets.setGlobal("OPENAI_API_KEY", "secret-value", {
      description: "Primary model credential",
      validationMethod: "api_key",
    });
    await first.stop();

    const secondSecrets = createElizaSecrets();
    const second = (await Service.start(
      createRuntime(secondSecrets) as never,
    )) as InstanceType<typeof Service>;

    expect(secondSecrets.values.get("OPENAI_API_KEY")).toBe("secret-value");
    expect(secondSecrets.configs.get("OPENAI_API_KEY")).toEqual({
      description: "Primary model credential",
      validationMethod: "api_key",
    });
    await second.stop();
  });

  it("prefers the active Eliza value while reconciling an existing Vault", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-vault-reconcile-"));
    roots.push(root);
    const Service = createTestService(root);
    const firstSecrets = createElizaSecrets();
    const first = (await Service.start(
      createRuntime(firstSecrets) as never,
    )) as InstanceType<typeof Service>;
    await first.setSecret("GITHUB_TOKEN", "vault-value");
    await first.stop();

    const activeSecrets = createElizaSecrets({ GITHUB_TOKEN: "active-value" });
    const active = (await Service.start(
      createRuntime(activeSecrets) as never,
    )) as InstanceType<typeof Service>;
    await active.stop();

    const hydratedSecrets = createElizaSecrets();
    const hydrated = (await Service.start(
      createRuntime(hydratedSecrets) as never,
    )) as InstanceType<typeof Service>;
    expect(hydratedSecrets.values.get("GITHUB_TOKEN")).toBe("active-value");
    await hydrated.stop();
  });

  it("imports and removes the retired plaintext JSON store", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-vault-migration-"));
    roots.push(root);
    const legacyPath = join(root, "secrets.json");
    writeFileSync(
      legacyPath,
      JSON.stringify({ secrets: { GITHUB_TOKEN: "legacy-secret" } }),
      "utf8",
    );
    const Service = createTestService(root);
    const secrets = createElizaSecrets();
    const service = (await Service.start(
      createRuntime(secrets) as never,
    )) as InstanceType<typeof Service>;

    expect(secrets.values.get("GITHUB_TOKEN")).toBe("legacy-secret");
    expect(existsSync(legacyPath)).toBe(false);
    await service.stop();
  });

  it("removes deleted native global secrets from durable storage", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-vault-delete-"));
    roots.push(root);
    const Service = createTestService(root);
    const firstSecrets = createElizaSecrets();
    const first = (await Service.start(
      createRuntime(firstSecrets) as never,
    )) as InstanceType<typeof Service>;
    await firstSecrets.setGlobal("TEMP_TOKEN", "temporary");
    await firstSecrets.deleteGlobal("TEMP_TOKEN");
    await first.stop();

    const secondSecrets = createElizaSecrets();
    const second = (await Service.start(
      createRuntime(secondSecrets) as never,
    )) as InstanceType<typeof Service>;
    expect(secondSecrets.values.has("TEMP_TOKEN")).toBe(false);
    await second.stop();
  });
});
