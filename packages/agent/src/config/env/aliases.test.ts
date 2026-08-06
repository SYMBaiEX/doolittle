import { describe, expect, it } from "vitest";
import { stageLegacyApiAliases } from "./aliases";

describe("stageLegacyApiAliases", () => {
  it("does not materialize missing values as the string undefined", () => {
    const env: NodeJS.ProcessEnv = {};

    stageLegacyApiAliases(env);

    expect(env.DOOLITTLE_API_BIND).toBeUndefined();
    expect(env.DOOLITTLE_API_PORT).toBeUndefined();
  });

  it("stages legacy host and port without replacing canonical aliases", () => {
    const env: NodeJS.ProcessEnv = {
      DOOLITTLE_HOST: "127.0.0.2",
      DOOLITTLE_PORT: "4312",
      DOOLITTLE_API_BIND: "0.0.0.0",
    };

    stageLegacyApiAliases(env);

    expect(env.DOOLITTLE_API_BIND).toBe("0.0.0.0");
    expect(env.DOOLITTLE_API_PORT).toBe("4312");
  });
});
