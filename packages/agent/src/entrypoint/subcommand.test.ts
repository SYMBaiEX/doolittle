import { describe, expect, it } from "bun:test";
import {
  isEntrypointAliasCommand,
  parseOneShotOptions,
  resolveEntrypointAliasPrompt,
  resolveSubcommand,
  shouldLoadLocalRuntimeEnvForEntrypoint,
} from "./subcommand";

describe("resolveSubcommand", () => {
  it("keeps legacy flags and aliases working", () => {
    expect(resolveSubcommand(["--cockpit", "status"])).toEqual({
      command: "cockpit",
      rest: ["status"],
    });
    expect(resolveSubcommand(["tui", "logs"])).toEqual({
      command: "cockpit",
      rest: ["logs"],
    });
    expect(resolveSubcommand(["status"])).toEqual({
      command: "status",
      rest: [],
    });
    expect(resolveSubcommand(["progress"])).toEqual({
      command: "progress",
      rest: [],
    });
    expect(resolveSubcommand(["tools", "search", "browser"])).toEqual({
      command: "tools",
      rest: ["search", "browser"],
    });
    expect(resolveSubcommand(["unknown", "rest"])).toEqual({
      command: "start",
      rest: ["unknown", "rest"],
    });
  });
});

describe("parseOneShotOptions", () => {
  it("reads named flags and positional prompts", () => {
    expect(
      parseOneShotOptions([
        "--prompt",
        "hello",
        "--json",
        "--background",
        "--job-id",
        "job-123",
        "--session-id",
        "sess-9",
      ]),
    ).toEqual({
      prompt: "hello",
      json: true,
      jsonStream: false,
      background: true,
      jobId: "job-123",
      sessionId: "sess-9",
    });
    expect(parseOneShotOptions(["summarize", "this", "repo"])).toEqual({
      prompt: "summarize this repo",
      json: false,
      jsonStream: false,
      background: false,
      jobId: undefined,
      sessionId: undefined,
    });
  });
});

describe("shouldLoadLocalRuntimeEnvForEntrypoint", () => {
  it("matches the entrypoint branches that need local env setup", () => {
    expect(shouldLoadLocalRuntimeEnvForEntrypoint("jobs")).toBe(true);
    expect(
      shouldLoadLocalRuntimeEnvForEntrypoint("exec", {
        prompt: "hi",
        json: false,
        jsonStream: true,
        background: false,
      }),
    ).toBe(true);
    expect(
      shouldLoadLocalRuntimeEnvForEntrypoint("exec", {
        prompt: "hi",
        json: false,
        jsonStream: false,
        background: false,
      }),
    ).toBe(false);
  });
});

describe("resolveEntrypointAliasPrompt", () => {
  it("maps top-level aliases onto the runtime command surface", () => {
    expect(resolveEntrypointAliasPrompt("status", [])).toBe("/status");
    expect(resolveEntrypointAliasPrompt("progress", [])).toBe("/progress");
    expect(resolveEntrypointAliasPrompt("tools", [])).toBe("/tools summary");
    expect(resolveEntrypointAliasPrompt("tools", ["search", "browser"])).toBe(
      "/tools search browser",
    );
    expect(resolveEntrypointAliasPrompt("skills", ["installed"])).toBe(
      "/skills installed",
    );
    expect(resolveEntrypointAliasPrompt("runtime", [])).toBe("/runtime status");
    expect(resolveEntrypointAliasPrompt("runtime", ["transports"])).toBe(
      "/runtime transports",
    );
    expect(resolveEntrypointAliasPrompt("start", [])).toBeUndefined();
  });
});

describe("isEntrypointAliasCommand", () => {
  it("identifies read-only runtime aliases", () => {
    expect(isEntrypointAliasCommand("status")).toBe(true);
    expect(isEntrypointAliasCommand("progress")).toBe(true);
    expect(isEntrypointAliasCommand("tools")).toBe(true);
    expect(isEntrypointAliasCommand("skills")).toBe(true);
    expect(isEntrypointAliasCommand("runtime")).toBe(true);
    expect(isEntrypointAliasCommand("exec")).toBe(false);
  });
});
