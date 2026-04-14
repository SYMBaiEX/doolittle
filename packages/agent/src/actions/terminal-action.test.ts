import { describe, expect, it } from "bun:test";
import {
  resolveCommandFromArguments,
  resolveCommandFromObject,
  resolveCommandFromParams,
  resolveCommandFromText,
} from "./terminal-action";

describe("resolveCommandFromObject", () => {
  it("resolves command fields in priority order", () => {
    expect(
      resolveCommandFromObject({
        command: "npm test",
        cmd: "should-ignore",
        commandLine: "should-ignore",
      }),
    ).toBe("npm test");
    expect(
      resolveCommandFromObject({
        args: ["echo", "hello", "world"],
      }),
    ).toBe("echo hello world");
  });
});

describe("resolveCommandFromArguments", () => {
  it("parses JSON argument strings", () => {
    expect(
      resolveCommandFromArguments('{"command":"bun test","cmd":"ignored"}'),
    ).toBe("bun test");
  });

  it("falls back to raw string when JSON parse fails", () => {
    expect(resolveCommandFromArguments("npm run build")).toBe("npm run build");
  });
});

describe("resolveCommandFromParams", () => {
  it("falls back through arguments and parameters", () => {
    expect(
      resolveCommandFromParams({
        command: "",
        input: JSON.stringify({ args: ["ls", "-la"] }),
      }),
    ).toBe("ls -la");
  });

  it("returns undefined for missing commands", () => {
    expect(resolveCommandFromParams(undefined)).toBeUndefined();
    expect(resolveCommandFromParams({})).toBeUndefined();
  });
});

describe("resolveCommandFromText", () => {
  it("parses shorthand shell commands", () => {
    expect(resolveCommandFromText("!git status")).toBe("git status");
    expect(resolveCommandFromText("run `pwd` in terminal")).toBe("pwd");
  });

  it("parses slash terminal command", () => {
    expect(resolveCommandFromText("/terminal run npm -v")).toBe("npm -v");
  });

  it("parses fenced code blocks", () => {
    expect(resolveCommandFromText("```bash\nls -la\n```")).toBe("ls -la");
  });
});
