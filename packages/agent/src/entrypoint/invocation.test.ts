import { describe, expect, it } from "bun:test";
import { resolveEntrypointInvocation } from "./invocation";

describe("resolveEntrypointInvocation", () => {
  it("reads piped prompts for the plain shell startup path", async () => {
    const stdin = {
      isTTY: false,
      async *[Symbol.asyncIterator]() {
        yield "quit";
      },
    };

    const result = await resolveEntrypointInvocation({
      argv: [],
      env: {},
      repoRoot: "/repo",
      stdin,
      stdoutIsTTY: false,
    });

    expect(result.command).toBe("start");
    expect(result.immediatePrompt).toBe("quit");
    expect(result.staticPromptResult).toEqual({
      text: "Closing Doolittle.",
      shouldExit: true,
    });
  });

  it("keeps exec prompts on the parsed one-shot path", async () => {
    const stdin = {
      isTTY: false,
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            throw new Error("exec should not read stdin as a piped prompt");
          },
        };
      },
    };

    const result = await resolveEntrypointInvocation({
      argv: ["exec", "--prompt", "review the repo", "--json"],
      env: {
        DOOLITTLE_NAME: "Doolittle",
        DOOLITTLE_JOB_CONTROL_DIR: "/tmp/jobs",
      },
      repoRoot: "/repo",
      stdin,
      stdoutIsTTY: false,
    });

    expect(result.command).toBe("exec");
    expect(result.oneShot).toEqual({
      prompt: "review the repo",
      json: true,
      jsonStream: false,
      background: false,
      jobId: undefined,
      sessionId: undefined,
    });
    expect(result.immediatePrompt).toBe("review the repo");
    expect(result.jobControlDir).toBe("/tmp/jobs");
  });

  it("maps top-level runtime aliases onto existing runtime prompts", async () => {
    const result = await resolveEntrypointInvocation({
      argv: ["tools", "search", "browser"],
      env: {},
      repoRoot: "/repo",
      stdin: {
        isTTY: true,
        async *[Symbol.asyncIterator]() {},
      },
      stdoutIsTTY: true,
    });

    expect(result.command).toBe("tools");
    expect(result.immediatePrompt).toBe("/tools search browser");
  });

  it("maps progress onto the runtime progress surface", async () => {
    const result = await resolveEntrypointInvocation({
      argv: ["progress"],
      env: {},
      repoRoot: "/repo",
      stdin: {
        isTTY: true,
        async *[Symbol.asyncIterator]() {},
      },
      stdoutIsTTY: true,
    });

    expect(result.command).toBe("progress");
    expect(result.immediatePrompt).toBe("/progress");
  });
});
