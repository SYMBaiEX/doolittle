import { describe, expect, it } from "bun:test";
import type { EnvConfig } from "@/types";
import { buildBrowserMcpServices } from "./integration-services";

function buildBaseConfig(overrides: Partial<EnvConfig> = {}) {
  return {
    browserProvider: "lightpanda",
    browserCommand: "lightpanda",
    mcpServerCommand: undefined,
    mcpTimeoutMs: 10000,
    ...overrides,
  } as EnvConfig;
}

describe("buildBrowserMcpServices", () => {
  it("builds pixel-backed browser metadata for lightpanda provider", async () => {
    const services = buildBrowserMcpServices(
      buildBaseConfig({
        browserProvider: "lightpanda",
        browserCommand: "lightpanda",
      }),
    );
    expect(await services.web.status()).toMatchObject({
      provider: "lightpanda",
      ready: true,
      mode: "browser",
      captureMode: "pixel",
      captureReady: true,
    });
    expect(services.mcp.status()).toMatchObject({
      enabled: false,
      command: undefined,
      timeoutMs: 10000,
    });
  });

  it("builds fallback browser metadata for non-pixel provider", async () => {
    const services = buildBrowserMcpServices(
      buildBaseConfig({
        browserProvider: "basic",
        browserCommand: undefined,
      }),
    );
    expect(await services.web.status()).toMatchObject({
      provider: "basic",
      ready: false,
      mode: "fallback",
      captureMode: "placeholder",
      captureReady: false,
    });
    expect(services.mcp.status()).toMatchObject({
      enabled: false,
    });
  });
});
