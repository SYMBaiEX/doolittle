import { describe, expect, it } from "bun:test";
import type { DotenvConfigOptions } from "dotenv";
import { loadProcessEnv, resolveRepoEnvPath } from "./load";

describe("env loading", () => {
  it("prefers the repo .env file when it exists", () => {
    const calls: DotenvConfigOptions[] = [];
    const env: NodeJS.ProcessEnv = {};

    loadProcessEnv("/repo", {
      env,
      exists: (path) => path === "/repo/.env",
      load: (options) => {
        calls.push(options ?? {});
        return { parsed: {} };
      },
    });

    expect(resolveRepoEnvPath("/repo")).toBe("/repo/.env");
    expect(env.DOTENV_CONFIG_QUIET).toBe("true");
    expect(calls).toEqual([
      {
        path: "/repo/.env",
        override: true,
        quiet: true,
      },
    ]);
  });

  it("falls back to default dotenv resolution when the repo file is absent", () => {
    const calls: DotenvConfigOptions[] = [];

    loadProcessEnv("/repo", {
      exists: () => false,
      load: (options) => {
        calls.push(options ?? {});
        return { parsed: {} };
      },
    });

    expect(calls).toEqual([
      {
        override: true,
        quiet: true,
      },
    ]);
  });
});
