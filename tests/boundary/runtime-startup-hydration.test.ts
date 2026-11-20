import type { Plugin } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createNoopLogger } from "../../packages/agent/src/logging/logger";
import { createDeferredHydrator } from "../../packages/agent/src/runtime/bootstrap/runtime/deferred-hydration";
import { StartupStateService } from "../../packages/agent/src/services/startup-state-service";

const tools: Plugin = { name: "test-tools", description: "A turn tool" };
const connector: Plugin = {
  name: "test-connector",
  description: "A messaging connector",
};

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(
  dependencies: Partial<Parameters<typeof createDeferredHydrator>[0]> = {},
) {
  const startupState = new StartupStateService();
  startupState.markReady("runtime");
  const services = {
    startupState,
    logger: createNoopLogger(),
    // These slots are accessed for warming, and their other capabilities are
    // deliberately absent from the fixture.
    diagnostics: {},
    operator: {},
    ecosystem: {},
    skills: {},
  } as Parameters<typeof createDeferredHydrator>[0]["services"];
  const registerTurnPlugin = vi.fn(async (_plugin: Plugin) => undefined);
  return {
    startupState,
    registerTurnPlugin,
    ...createDeferredHydrator({
      services,
      loadTurnPlugins: async () => [tools],
      loadMessagingPlugins: async () => [connector],
      registerTurnPlugin,
      registerMessagingPlugin: async () => undefined,
      ensureGateway: () => startupState.markReady("gateway"),
      startScheduler: async () => undefined,
      ...dependencies,
    }),
  };
}

it("makes shared turn tools available while a messaging connector starts", async () => {
  const entered = deferred();
  const connected = deferred();
  const startup = fixture({
    registerMessagingPlugin: async () => {
      entered.resolve();
      await connected.promise;
    },
  });
  const warmup = startup.ensureDeferredHydration();
  try {
    await entered.promise;
    await startup.ensureTurnPlugins();
    expect(startup.registerTurnPlugin).toHaveBeenCalledExactlyOnceWith(tools);
    const state = startup.startupState.getSnapshot();
    expect(state.hotPathReady).toBe(true);
    expect(state.phases.tools.status).toBe("ready");
    expect(state.phases.messaging.status).toBe("warming");
    expect(state.deferredReady).toBe(false);
  } finally {
    connected.resolve();
    await warmup;
  }
  expect(startup.startupState.getSnapshot().phases.messaging.status).toBe(
    "ready",
  );
});

it("cancels a waiting turn while preserving the shared startup attempt and its failure state", async () => {
  const loading = deferred();
  const loadTurnPlugins = vi.fn(async () => {
    await loading.promise;
    return [tools];
  });
  const registerTurnPlugin = vi
    .fn(async () => undefined)
    .mockRejectedValueOnce(new Error("credential example must stay private"));
  const startup = fixture({ loadTurnPlugins, registerTurnPlugin });
  const controller = new AbortController();
  const cancelled = startup.ensureTurnPlugins(controller.signal);
  const concurrent = startup.ensureTurnPlugins();
  controller.abort(new Error("cancelled by user"));
  try {
    await expect(cancelled).rejects.toThrow("cancelled by user");
  } finally {
    loading.resolve();
    await concurrent;
  }

  expect(loadTurnPlugins).toHaveBeenCalledTimes(1);
  const state = startup.startupState.getSnapshot();
  expect(state.hotPathReady).toBe(true);
  expect(state.phases.tools).toMatchObject({
    status: "error",
    detail: "Unavailable tools plugins: test-tools",
  });

  await startup.ensureTurnPlugins();
  expect(loadTurnPlugins).toHaveBeenCalledTimes(1);
  expect(registerTurnPlugin).toHaveBeenCalledTimes(2);
  expect(startup.startupState.getSnapshot().phases.tools.status).toBe("ready");
});
