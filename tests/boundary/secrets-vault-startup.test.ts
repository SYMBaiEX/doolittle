import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSecretsVaultPersistenceService } from "../../packages/plugins/doolittle-plugin/secrets-vault/service";

type SecretConfig = Record<string, unknown>;
type ChangeHandler = (
  key: string,
  value: string | null,
  context: { level: "global" },
) => Promise<void>;

function nativeSecrets() {
  const entries = new Map<
    string,
    { value: string; config: SecretConfig | null }
  >();
  let changeHandler: ChangeHandler | undefined;
  const secrets = {
    list: vi.fn<() => Promise<Record<string, unknown>>>(async () =>
      Object.fromEntries([...entries.keys()].map((key) => [key, {}])),
    ),
    async setGlobal(key: string, value: string, config?: SecretConfig) {
      entries.set(key, { value, config: config ?? null });
      await changeHandler?.(key, value, { level: "global" });
      return true;
    },
    async deleteGlobal(key: string) {
      entries.delete(key);
      await changeHandler?.(key, null, { level: "global" });
    },
    async getGlobal(key: string) {
      return entries.get(key)?.value ?? null;
    },
    async getConfig(key: string) {
      return entries.get(key)?.config ?? null;
    },
    onAnySecretChanged(callback: ChangeHandler) {
      changeHandler = callback;
      return () => {
        changeHandler = undefined;
      };
    },
  };
  const runtime = {
    agentId: "fixture-agent",
    getServiceLoadPromise: async () => secrets,
  } as unknown as IAgentRuntime;
  return { runtime, secrets };
}

let profile: string;
let vaultDatabase: string;

beforeEach(() => {
  profile = mkdtempSync(join(tmpdir(), "doolittle-vault-startup-"));
  vaultDatabase = join(profile, ".vault-pglite");
  vi.stubEnv("ELIZA_VAULT_DISABLE_KEYCHAIN", "1");
  vi.stubEnv("ELIZA_VAULT_PASSPHRASE", "private-fixture-passphrase");
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(profile, { recursive: true, force: true });
});

it("keeps a fresh vault unopened until the first global write and restores its value and configuration", async () => {
  const VaultService = createSecretsVaultPersistenceService(profile);
  const first = nativeSecrets();
  const service = await VaultService.start(first.runtime);
  try {
    expect(first.secrets.list).toHaveBeenCalledOnce();
    expect(existsSync(vaultDatabase)).toBe(false);
    await first.secrets.setGlobal("fixture.token", "fixture-value", {
      validationMethod: "none",
    });
    expect(existsSync(vaultDatabase)).toBe(true);
  } finally {
    await service.stop();
  }

  const reopened = nativeSecrets();
  const restored = await VaultService.start(reopened.runtime);
  try {
    await expect(reopened.secrets.getGlobal("fixture.token")).resolves.toBe(
      "fixture-value",
    );
    await expect(reopened.secrets.getConfig("fixture.token")).resolves.toEqual({
      validationMethod: "none",
    });
    await reopened.secrets.deleteGlobal("fixture.token");
  } finally {
    await restored.stop();
  }

  const afterDeletion = nativeSecrets();
  const verified = await VaultService.start(afterDeletion.runtime);
  try {
    await expect(
      afterDeletion.secrets.getGlobal("fixture.token"),
    ).resolves.toBe(null);
  } finally {
    await verified.stop();
  }
}, 15_000);

it.each([
  {
    file: "secrets.json",
    contents: { secrets: { "fixture.token": "fixture-value" } },
    remains: false,
  },
  {
    file: "vault.json",
    contents: {
      version: 1,
      entries: {
        "fixture.token": {
          kind: "value",
          value: "fixture-value",
          lastModified: 1,
        },
      },
    },
    remains: true,
  },
])(
  "hydrates $file before exposing the runtime secrets service",
  async ({ file, contents, remains }) => {
    const path = join(profile, file);
    writeFileSync(path, JSON.stringify(contents), { mode: 0o600 });
    const { runtime, secrets } = nativeSecrets();
    const service =
      await createSecretsVaultPersistenceService(profile).start(runtime);
    try {
      await expect(secrets.getGlobal("fixture.token")).resolves.toBe(
        "fixture-value",
      );
      expect(existsSync(path)).toBe(remains);
    } finally {
      await service.stop();
    }
  },
);

it("persists existing SDK global keys even when the vault store is absent", async () => {
  const { runtime, secrets } = nativeSecrets();
  await secrets.setGlobal("fixture.token", "runtime-value");
  const VaultService = createSecretsVaultPersistenceService(profile);
  const service = await VaultService.start(runtime);
  try {
    expect(existsSync(vaultDatabase)).toBe(true);
  } finally {
    await service.stop();
  }
  const reopened = nativeSecrets();
  const restored = await VaultService.start(reopened.runtime);
  try {
    await expect(reopened.secrets.getGlobal("fixture.token")).resolves.toBe(
      "runtime-value",
    );
  } finally {
    await restored.stop();
  }
});

it("propagates native inventory failure without initializing a vault", async () => {
  const { runtime, secrets } = nativeSecrets();
  const service = createSecretsVaultPersistenceService(profile);
  secrets.list.mockRejectedValueOnce(new Error("Native storage unavailable"));
  await expect(service.start(runtime)).rejects.toThrow(
    "Native storage unavailable",
  );
  secrets.list.mockResolvedValueOnce(
    null as unknown as Record<string, unknown>,
  );
  await expect(service.start(runtime)).rejects.toThrow(
    "Eliza global secret inventory is unavailable",
  );
  expect(existsSync(vaultDatabase)).toBe(false);
});

it("does not treat a damaged SDK vault path as a fresh profile", async () => {
  const { runtime } = nativeSecrets();
  writeFileSync(vaultDatabase, "fixture-damaged-vault");
  await expect(
    createSecretsVaultPersistenceService(profile).start(runtime),
  ).rejects.toThrow();
  expect(readFileSync(vaultDatabase, "utf8")).toBe("fixture-damaged-vault");
});
