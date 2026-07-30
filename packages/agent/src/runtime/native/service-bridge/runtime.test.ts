import {
  DOOLITTLE_BROWSER_SERVICE,
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "@doolittle/contracts";
import { describe, expect, it } from "vitest";
import { getNativeServices, type RuntimeLike } from "./runtime";

describe("getNativeServices", () => {
  it("resolves Doolittle projections only through their namespaced contracts", () => {
    const shell = { run: async () => ({}), history: () => [] };
    const browser = { capture: async () => ({}) };
    const mcp = { invoke: async () => ({}) };
    const loaded = new Map<string, unknown>([
      [DOOLITTLE_SHELL_SERVICE, shell],
      [DOOLITTLE_BROWSER_SERVICE, browser],
      [DOOLITTLE_MCP_SERVICE, mcp],
    ]);
    const runtime = {
      getService(name: string) {
        return loaded.get(name) ?? null;
      },
    } as RuntimeLike;

    const services = getNativeServices(runtime);
    expect(services.shell).toBe(shell);
    expect(services.browser).toBe(browser);
    expect(services.mcp).toBe(mcp);
  });

  it("keeps official service identifiers reserved for their SDK owners", () => {
    const runtime = {
      getService(name: string) {
        return ["shell", "browser", "mcp"].includes(name) ? {} : null;
      },
    } as RuntimeLike;

    const services = getNativeServices(runtime);
    expect(services.shell).toBeUndefined();
    expect(services.browser).toBeUndefined();
    expect(services.mcp).toBeUndefined();
  });
});
