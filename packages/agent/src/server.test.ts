import { describe, expect, it } from "vitest";
import { publishElizaApiPort } from "./server";

describe("publishElizaApiPort", () => {
  it("publishes the actual bound port for official in-process Eliza actions", () => {
    const env: NodeJS.ProcessEnv = { ELIZA_PORT: "2138" };

    publishElizaApiPort(48_123, env);

    expect(env.ELIZA_PORT).toBe("48123");
  });
});
