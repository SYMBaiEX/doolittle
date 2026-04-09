import { describe, expect, it } from "bun:test";
import {
  parseOneShotOptions,
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
