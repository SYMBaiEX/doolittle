import { describe, expect, it } from "bun:test";
import { AppContextManager } from "./app-context-manager";
import type { AppContext } from "./types";

function createContext(): AppContext {
  return {
    config: {} as AppContext["config"],
    services: {} as AppContext["services"],
    runtime: {} as AppContext["runtime"],
    gateway: {} as AppContext["gateway"],
    ensureDeferredHydration: async () => {},
  };
}

describe("AppContextManager", () => {
  it("reuses the built context and hydrates on later eager requests", async () => {
    let buildCount = 0;
    const hydrationReasons: string[] = [];
    const context = createContext();
    context.ensureDeferredHydration = async (reason?: string) => {
      hydrationReasons.push(reason ?? "");
    };

    const manager = new AppContextManager(async () => {
      buildCount += 1;
      return context;
    });

    const first = await manager.get({ startupMode: "cli" });
    const second = await manager.get({ startupMode: "api" });

    expect(first).toBe(context);
    expect(second).toBe(context);
    expect(buildCount).toBe(1);
    expect(hydrationReasons).toEqual(["api"]);
  });

  it("resets failed builds so a later request can recover", async () => {
    let attempts = 0;
    const manager = new AppContextManager(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("boom");
      }
      return createContext();
    });

    await expect(manager.get()).rejects.toThrow("boom");
    await expect(manager.get()).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });
});
