import { expect, it } from "vitest";
import { readLinkedProvider } from "../../packages/agent/src/server/routes/runtime/shared";
import { createServiceModelContextResolver } from "../../packages/agent/src/services/bootstrap/model";
import { applyProviderBootstrapFallbacks } from "../../packages/agent/src/services/bootstrap/settings/cloud-bootstrap";
import type { RuntimeSettingsSnapshot } from "../../packages/agent/src/services/bootstrap/settings/types";
import type { SettingsService } from "../../packages/agent/src/services/settings-service";
import type { EnvConfig } from "../../packages/agent/src/types";

it("rejects the removed provider and keeps an old model route offline", () => {
  expect(readLinkedProvider("devin")).toBeUndefined();
  expect(readLinkedProvider("codex")).toBe("codex");
  const model = {
    provider: "devin",
    model: "previous-model",
    baseUrl: "",
    temperature: 0,
    maxTokens: 100,
  };
  const settings = { get: () => ({ model }) } as unknown as SettingsService;
  const resolve = createServiceModelContextResolver(settings, {} as EnvConfig);
  expect(resolve().provider).toBe("offline");
  const updates: unknown[] = [];
  applyProviderBootstrapFallbacks(
    { offlineBootstrapMode: false } as EnvConfig,
    { model } as RuntimeSettingsSnapshot,
    (...args) => {
      updates.push(args);
      return { model } as RuntimeSettingsSnapshot;
    },
  );
  expect(updates).toEqual([]);
  expect(model.provider).toBe("devin");
});
