import { describe, expect, it } from "vitest";
import type { EnvConfig } from "@/types";
import { buildBrowserIntegrationServices } from "./integration-services";

function buildBaseConfig(overrides: Partial<EnvConfig> = {}) {
  return {
    browserProvider: "lightpanda",
    browserCommand: "lightpanda",
    mcpServerCommand: undefined,
    mcpTimeoutMs: 10000,
    ...overrides,
  } as EnvConfig;
}

describe("buildBrowserIntegrationServices", () => {
  it("builds pixel-backed browser metadata for lightpanda provider", async () => {
    const services = buildBrowserIntegrationServices(
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
  });

  it("builds fallback browser metadata for non-pixel provider", async () => {
    const services = buildBrowserIntegrationServices(
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
  });
});
