import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { applyEmbeddingSettings } from "../../packages/agent/src/runtime/bootstrap/env/plugin-settings/embedding";
import type {
  EnvConfig,
  PluginSettings,
} from "../../packages/agent/src/runtime/bootstrap/env/plugin-settings/types";

it("uses the SDK's embedding ownership flag instead of filtering its model registry", async () => {
  const require = createRequire(resolve("packages/agent/package.json"));
  const { registerCloudEmbeddingModels } = await import(
    pathToFileURL(require.resolve("@elizaos/plugin-elizacloud")).href
  );
  const settings = {} as PluginSettings;
  const config = {} as EnvConfig;
  const registerModel = vi.fn();
  const runtime = {
    registerModel,
    getSetting: (key: string): unknown => Reflect.get(settings, key),
  };
  vi.stubEnv("ELIZAOS_CLOUD_USE_EMBEDDINGS", undefined);
  try {
    applyEmbeddingSettings(settings, config, {});
    expect(settings.ELIZAOS_CLOUD_USE_EMBEDDINGS).toBe("false");
    registerCloudEmbeddingModels(runtime);
    expect(registerModel).not.toHaveBeenCalled();
    applyEmbeddingSettings(settings, config, {
      DOOLITTLE_EMBEDDING_PROVIDER: "elizacloud",
    });
    registerCloudEmbeddingModels(runtime);
    expect(registerModel.mock.calls.map(([type]) => type)).toContain(
      "TEXT_EMBEDDING",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
