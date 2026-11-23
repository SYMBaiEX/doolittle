import { createRequire } from "node:module";
import type { IAgentRuntime, Plugin } from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { listEffectiveSecretKeys } from "../../packages/agent/src/runtime/native/service-bridge/autocoder/secrets";
import { handleSecretsRoutes } from "../../packages/agent/src/server/routes/secrets";

const { SECRETS_SERVICE_TYPE, secretsManagerPlugin } = createRequire(
  new URL("../../packages/agent/package.json", import.meta.url),
)("@elizaos/plugin-assistant") as {
  SECRETS_SERVICE_TYPE: string;
  secretsManagerPlugin: Plugin;
};

afterEach(() => vi.unstubAllEnvs());

it("saves global credentials outside a conversation and lists names only through the real SDK", async () => {
  vi.stubEnv("DOOLITTLE_DESKTOP_RUNTIME", "1");
  const SecretsService = secretsManagerPlugin.services?.find(
    (service) => service.serviceType === SECRETS_SERVICE_TYPE,
  );
  if (!SecretsService) throw new Error("SDK secrets service is unavailable");
  const runtime = {
    agentId: "5c36ca3d-8c6d-4b93-a387-d91c36949016",
    character: { name: "inventory-fixture", settings: {} },
    getSetting: (key: string) =>
      key === "ENCRYPTION_SALT" ? "inventory-fixture-salt" : null,
    getService: (name: string) =>
      name === SECRETS_SERVICE_TYPE ? secrets : null,
  } as unknown as IAgentRuntime;
  const secrets = await SecretsService.start(runtime);
  const context = { runtime, services: {} } as AppContext;
  const url = new URL("http://localhost/secrets");
  const inventory = () => handleSecretsRoutes(context, new Request(url), url);

  try {
    const empty = await inventory();
    expect(empty?.status).toBe(200);
    await expect(empty?.json()).resolves.toEqual({ keys: [] });

    const saveUrl = new URL("http://localhost/secrets/set");
    for (const key of ["Z_FIXTURE_TOKEN", "A_FIXTURE_TOKEN"]) {
      const response = await handleSecretsRoutes(
        context,
        new Request(saveUrl, {
          method: "POST",
          body: JSON.stringify({ key, value: "synthetic-fixture-value" }),
        }),
        saveUrl,
      );
      expect(response?.status).toBe(200);
      await expect(response?.json()).resolves.toEqual({
        key,
        valueSet: true,
      });
    }
    const populated = await inventory();
    expect(populated?.status).toBe(200);
    await expect(populated?.json()).resolves.toEqual({
      keys: ["A_FIXTURE_TOKEN", "Z_FIXTURE_TOKEN"],
    });

    const revealUrl = new URL("http://localhost/secrets/get");
    const revealed = await handleSecretsRoutes(
      context,
      new Request(revealUrl, {
        method: "POST",
        body: JSON.stringify({ key: "A_FIXTURE_TOKEN" }),
      }),
      revealUrl,
    );
    await expect(revealed?.json()).resolves.toEqual({
      key: "A_FIXTURE_TOKEN",
      value: "synthetic-fixture-value",
    });
  } finally {
    await secrets.stop();
  }
});

it.each([
  {
    failure: "refuses the write",
    result: false,
    message:
      "Could not securely save this key. Try again. If it still fails, restart Doolittle.",
  },
  {
    failure: "throws a storage error containing sensitive details",
    result: new Error("Cannot store fixture-value for FIXTURE_TOKEN"),
    message:
      "Could not securely save this key. Try again. If it still fails, restart Doolittle.",
  },
  {
    failure: "cannot access the system keychain",
    result: new Error(
      "vault: master key unavailable (keychain://eliza/vault.masterKey): fixture-value",
    ),
    message:
      "Secure storage is locked or unavailable. Unlock your system keychain (or install GNOME Keyring/KWallet on Linux), then restart Doolittle and save again.",
  },
])(
  "returns safe recovery guidance when the SDK $failure",
  async ({ result, message }) => {
    const setGlobal = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    const context = {
      runtime: {
        getService: (name: string) =>
          name === SECRETS_SERVICE_TYPE ? { setGlobal } : null,
      },
    } as unknown as AppContext;
    const url = new URL("http://localhost/secrets/set");
    const response = await handleSecretsRoutes(
      context,
      new Request(url, {
        method: "POST",
        body: JSON.stringify({ key: "FIXTURE_TOKEN", value: "fixture-value" }),
      }),
      url,
    );
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: message,
    });
  },
);

it("does not disguise an unavailable inventory as an empty store", async () => {
  await expect(
    listEffectiveSecretKeys({
      agentId: "5c36ca3d-8c6d-4b93-a387-d91c36949016",
      getService: () => null,
    }),
  ).rejects.toThrow("Eliza secrets service is unavailable");
});
