import { createRequire } from "node:module";
import type { IAgentRuntime, Plugin } from "@elizaos/core";
import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import {
  listEffectiveSecretKeys,
  setEffectiveSecret,
} from "../../packages/agent/src/runtime/native/service-bridge/autocoder/secrets";
import { handleSecretsRoutes } from "../../packages/agent/src/server/routes/secrets";

const { SECRETS_SERVICE_TYPE, secretsManagerPlugin } = createRequire(
  new URL("../../packages/agent/package.json", import.meta.url),
)("@elizaos/plugin-assistant") as {
  SECRETS_SERVICE_TYPE: string;
  secretsManagerPlugin: Plugin;
};

it("lists an empty local inventory and newly stored names through the real SDK", async () => {
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
  const context = { runtime } as AppContext;
  const url = new URL("http://localhost/secrets");
  const inventory = () => handleSecretsRoutes(context, new Request(url), url);

  try {
    const empty = await inventory();
    expect(empty?.status).toBe(200);
    await expect(empty?.json()).resolves.toEqual({ keys: [] });

    await setEffectiveSecret(runtime, "Z_FIXTURE_TOKEN", "synthetic-value-z");
    await setEffectiveSecret(runtime, "A_FIXTURE_TOKEN", "synthetic-value-a");
    const populated = await inventory();
    expect(populated?.status).toBe(200);
    await expect(populated?.json()).resolves.toEqual({
      keys: ["A_FIXTURE_TOKEN", "Z_FIXTURE_TOKEN"],
    });
  } finally {
    await secrets.stop();
  }
});

it("does not disguise an unavailable inventory as an empty store", async () => {
  await expect(
    listEffectiveSecretKeys({
      agentId: "5c36ca3d-8c6d-4b93-a387-d91c36949016",
      getService: () => null,
    }),
  ).rejects.toThrow("Eliza secrets service is unavailable");
});
