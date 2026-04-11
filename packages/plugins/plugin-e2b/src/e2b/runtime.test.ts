import { describe, expect, it } from "bun:test";

import { collectProcessEnv, resolveExecutionCommand } from "./runtime";

describe("plugin-e2b runtime helpers", () => {
  it("resolves the expected command for supported languages", () => {
    expect(resolveExecutionCommand("python", "print('ok')")).toEqual([
      "python3",
      ["-c", "print('ok')"],
    ]);
    expect(resolveExecutionCommand("javascript", "console.log('ok')")).toEqual([
      "node",
      ["-e", "console.log('ok')"],
    ]);
    expect(resolveExecutionCommand("typescript", "console.log('ok')")).toEqual([
      "bun",
      ["-e", "console.log('ok')"],
    ]);
    expect(resolveExecutionCommand("bash", "echo ok")).toEqual([
      "bash",
      ["-lc", "echo ok"],
    ]);
  });

  it("falls back to python for unknown languages", () => {
    expect(resolveExecutionCommand("ruby", "puts 'ok'")).toEqual([
      "python3",
      ["-c", "puts 'ok'"],
    ]);
  });

  it("collects only string environment values", () => {
    process.env.PLUGIN_E2B_TEST_VALUE = "ok";
    const env = collectProcessEnv();
    expect(env.PLUGIN_E2B_TEST_VALUE).toBe("ok");
    expect(Object.values(env).every((value) => typeof value === "string")).toBe(
      true,
    );
    delete process.env.PLUGIN_E2B_TEST_VALUE;
  });
});
