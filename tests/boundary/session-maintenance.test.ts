import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";

type IAgentRuntime = AppContext["runtime"];
type Service = { stop(): Promise<void> };

import { afterEach, expect, it, vi } from "vitest";
import { buildEnvConfig } from "../../packages/agent/src/config/env/build";
import { resolveManagedDirectories } from "../../packages/agent/src/config/env/directories";
import { parseEnv } from "../../packages/agent/src/config/env/schema";
import { createSchedulerRuntimeService } from "../../packages/agent/src/runtime/native/plugin-registry/product/scheduler-service";
import type { AppServices } from "../../packages/agent/src/services";
import { resolveDefaultServiceModel } from "../../packages/agent/src/services/bootstrap/model";
import { createServiceSettings } from "../../packages/agent/src/services/bootstrap/settings";

const roots: string[] = [];
let service: Service | undefined;
afterEach(async () => {
  await service?.stop();
  service = undefined;
  vi.useRealTimers();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function settingsFixture(saved: unknown) {
  const root = mkdtempSync(join(tmpdir(), "doolittle-settings-migration-"));
  roots.push(root);
  const environment = { DOOLITTLE_DATA_DIR: root };
  const values = parseEnv(environment);
  const config = buildEnvConfig(
    values,
    resolveManagedDirectories(root, values),
    environment,
  );
  writeFileSync(join(root, "settings.json"), JSON.stringify(saved));
  return {
    root,
    settings: createServiceSettings(config, resolveDefaultServiceModel(config)),
  };
}
it("migrates model-only profiles before session maintenance and persists complete defaults", () => {
  const { root, settings } = settingsFixture({
    model: { provider: "codex", model: "gpt-6-luna" },
  });
  const restored = settings.get();
  expect(restored.gateway).toEqual({
    sessionTimeoutMinutes: 120,
    mirrorResponsesToHistory: true,
  });
  expect(restored.model.provider).toBe("codex");
  expect(restored.model.maxTokens).toBeGreaterThan(0);
  expect(
    JSON.parse(readFileSync(join(root, "settings.json"), "utf8")).gateway,
  ).toEqual(restored.gateway);
});
it("fills missing core fields without replacing explicit provider and gateway preferences", () => {
  const { settings } = settingsFixture({
    model: { provider: "offline", model: "offline", temperature: 0 },
    gateway: { sessionTimeoutMinutes: 7, mirrorResponsesToHistory: false },
  });
  expect(settings.get().gateway).toEqual({
    sessionTimeoutMinutes: 7,
    mirrorResponsesToHistory: false,
  });
  expect(settings.get().model).toMatchObject({
    provider: "offline",
    model: "offline",
    temperature: 0,
  });
  expect(settingsFixture({}).settings.get().model.provider).toBe("codex");
});
it("survives a failed maintenance tick and continues expiring sessions", async () => {
  vi.useFakeTimers();
  const { settings } = settingsFixture({
    model: { provider: "offline", model: "offline" },
  });
  const expireOlderThan = vi.fn().mockReturnValue(["expired-session"]);
  const emit = vi
    .fn()
    .mockRejectedValueOnce(new Error("transient hook failure"))
    .mockResolvedValue(undefined);
  const RuntimeService = createSchedulerRuntimeService({
    settings,
    gatewaySessions: { expireOlderThan },
    hooks: { emit },
  } as unknown as AppServices);
  service = await RuntimeService.start({} as IAgentRuntime);
  await (
    service as Service & { startScheduler(): Promise<void> }
  ).startScheduler();
  await vi.advanceTimersByTimeAsync(120_000);
  expect(expireOlderThan).toHaveBeenCalledTimes(2);
  expect(expireOlderThan).toHaveBeenCalledWith(120);
  expect(emit).toHaveBeenCalledTimes(2);
});
