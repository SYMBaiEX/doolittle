import type { AgentRuntime } from "@elizaos/core";
import { afterEach, expect, it, vi } from "vitest";
import { validateCriticalRuntimeServices } from "../../packages/agent/src/runtime/bootstrap/runtime/critical";

afterEach(() => vi.unstubAllEnvs());

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("overlaps independent lead services and keeps subsequent checks behind both", async () => {
  vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "lead");
  const experience = deferred();
  const character = deferred();
  const loadService = vi.fn((type: string) => {
    if (type === "EXPERIENCE") return experience.promise;
    if (type === "CHARACTER_MANAGEMENT") return character.promise;
    return Promise.resolve();
  });
  const getRooms = vi.fn(async () => []);
  const ready = validateCriticalRuntimeServices({
    agentId: "test-agent",
    hasService: () => true,
    getServiceLoadPromise: loadService,
    getRooms,
  } as unknown as AgentRuntime);

  try {
    expect(loadService.mock.calls).toEqual([
      ["EXPERIENCE"],
      ["CHARACTER_MANAGEMENT"],
    ]);
    character.resolve();
    await Promise.resolve();
    expect(loadService).toHaveBeenCalledTimes(2);
    expect(getRooms).not.toHaveBeenCalled();
  } finally {
    experience.resolve();
    character.resolve();
    await ready;
  }
  expect(getRooms).toHaveBeenCalledOnce();
});

it("preserves early service failure priority when both starts fail", async () => {
  vi.stubEnv("DOOLITTLE_BOT_RUNTIME", "lead");
  const loadService = vi.fn((type: string) => Promise.reject(new Error(type)));
  const getRooms = vi.fn(async () => []);
  await expect(
    validateCriticalRuntimeServices({
      hasService: () => true,
      getServiceLoadPromise: loadService,
      getRooms,
    } as unknown as AgentRuntime),
  ).rejects.toThrow("EXPERIENCE");
  expect(loadService).toHaveBeenCalledTimes(2);
  expect(getRooms).not.toHaveBeenCalled();
});
