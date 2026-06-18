import { describe, expect, it } from "bun:test";
import {
  isTerminalIntent,
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

describe("isTerminalIntent", () => {
  it("matches explicit terminal prefixes", () => {
    expect(isTerminalIntent("!git status")).toBe(true);
    expect(isTerminalIntent("/terminal run npm -v")).toBe(true);
    expect(isTerminalIntent("run `pwd` in terminal")).toBe(true);
  });

  it("matches scaffolding requests that name package managers", () => {
    expect(
      isTerminalIntent(
        'Go to ~/symbiex/dev and create a folder named "the-game". In the folder, build a react app (use bunx or npx to scaffold from an official boilerplate so we can reduce context, find this online)',
      ),
    ).toBe(true);
    expect(isTerminalIntent("scaffold a new vite project")).toBe(true);
    expect(isTerminalIntent("git clone https://example.com/foo")).toBe(true);
    expect(isTerminalIntent("cargo build the workspace please")).toBe(true);
  });

  it("ignores prose without shell intent", () => {
    expect(isTerminalIntent("how are you?")).toBe(false);
    expect(isTerminalIntent("explain how react routing works")).toBe(false);
  });
});
