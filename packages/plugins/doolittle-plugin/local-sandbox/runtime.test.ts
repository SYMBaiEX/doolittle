import { describe, expect, it } from "vitest";

import { collectProcessEnv, resolveExecutionCommand } from "./runtime";

describe("local sandbox runtime helpers", () => {
  it("resolves the expected command for supported languages", () => {
    expect(resolveExecutionCommand("python", "print('ok')")).toEqual([
      "python3",
      ["-c", "print('ok')"],
    ]);
    expect(resolveExecutionCommand("javascript", "console.log('ok')")).toEqual([
      process.execPath,
      ["-e", "console.log('ok')"],
    ]);
    expect(resolveExecutionCommand("typescript", "console.log('ok')")).toEqual([
      process.execPath,
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

  it("passes presentation settings without exposing the host environment", () => {
    process.env.DOOLITTLE_SANDBOX_SECRET_TEST = "private";
    process.env.NO_COLOR = "1";
    const env = collectProcessEnv();
    expect(env.NO_COLOR).toBe("1");
    expect(env.DOOLITTLE_SANDBOX_SECRET_TEST).toBeUndefined();
    expect(Object.values(env).every((value) => typeof value === "string")).toBe(
      true,
    );
    delete process.env.DOOLITTLE_SANDBOX_SECRET_TEST;
    delete process.env.NO_COLOR;
  });
});
