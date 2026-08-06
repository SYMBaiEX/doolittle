import { syncResolvedApiPort } from "@elizaos/shared";
import { describe, expect, it } from "vitest";

describe("Eliza-native API environment", () => {
  it("publishes the actual bound port through the SDK contract", () => {
    const env: NodeJS.ProcessEnv = { ELIZA_PORT: "2138" };

    syncResolvedApiPort(env, 48_123);

    expect(env.ELIZA_API_PORT).toBe("48123");
    expect(env.ELIZA_PORT).toBe("48123");
  });
});
