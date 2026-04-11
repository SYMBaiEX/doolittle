import { describe, expect, it } from "bun:test";
import {
  getElizaCloudAuthDependencies,
  getElizaCloudEnvKey,
  isElizaCloudInferenceEnabled,
} from "./elizacloud-support";

describe("Eliza Cloud auth support helpers", () => {
  it("prefers the canonical cloud env key when both aliases are present", () => {
    const previousPrimary = process.env.ELIZAOS_CLOUD_API_KEY;
    const previousAlias = process.env.ELIZA_CLOUD_API_KEY;
    process.env.ELIZAOS_CLOUD_API_KEY = "primary-key";
    process.env.ELIZA_CLOUD_API_KEY = "alias-key";
    try {
      expect(getElizaCloudEnvKey()).toEqual({
        key: "ELIZAOS_CLOUD_API_KEY",
        value: "primary-key",
      });
    } finally {
      if (previousPrimary === undefined) {
        delete process.env.ELIZAOS_CLOUD_API_KEY;
      } else {
        process.env.ELIZAOS_CLOUD_API_KEY = previousPrimary;
      }
      if (previousAlias === undefined) {
        delete process.env.ELIZA_CLOUD_API_KEY;
      } else {
        process.env.ELIZA_CLOUD_API_KEY = previousAlias;
      }
    }
  });

  it("normalizes truthy enablement flags for managed cloud inference", () => {
    const previous = process.env.ELIZAOS_CLOUD_ENABLED;
    try {
      process.env.ELIZAOS_CLOUD_ENABLED = "yes";
      expect(isElizaCloudInferenceEnabled()).toBe(true);
      process.env.ELIZAOS_CLOUD_ENABLED = "0";
      expect(isElizaCloudInferenceEnabled()).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.ELIZAOS_CLOUD_ENABLED;
      } else {
        process.env.ELIZAOS_CLOUD_ENABLED = previous;
      }
    }
  });

  it("builds dependencies with the shared support hooks wired in", () => {
    const deps = getElizaCloudAuthDependencies();
    expect(typeof deps.commandExists).toBe("function");
    expect(typeof deps.getElizaCloudEnvKey).toBe("function");
    expect(typeof deps.isElizaCloudInferenceEnabled).toBe("function");
    expect(typeof deps.persistProviderCredentials).toBe("function");
    expect(typeof deps.resolveCloudApiBaseUrl).toBe("function");
  });
});
