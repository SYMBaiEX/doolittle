import { describe, expect, it } from "vitest";
import {
  createRepositoryAction,
  executeRepositoryCommand,
  resolveRepositoryCommandIntent,
} from "./repository-action";

describe("repository action command facade", () => {
  it("lets the Eliza planner select and parameterize repository inspection", async () => {
    const action = createRepositoryAction();
    const runtime = {
      getService(serviceType: string) {
        return serviceType === "doolittle_coding_agent"
          ? {
              repoStatus: () => "working tree clean",
              repoDiff: () => "1 file changed",
              repoLog: () => "abc123 converge command handling",
            }
          : null;
      },
    };
    const message = {
      content: { text: "Tell me about the project architecture." },
    } as never;

    await expect(action.validate({} as never, message)).resolves.toBe(true);
    await expect(
      action.handler(runtime as never, message, undefined, {
        parameters: { intent: "diff" },
      }),
    ).resolves.toMatchObject({
      success: true,
      text: "1 file changed",
      verifiedUserFacing: true,
    });
  });

  it("maps only explicit slash syntax through the command facade", () => {
    expect(resolveRepositoryCommandIntent("/repo")).toBe("status");
    expect(resolveRepositoryCommandIntent("/repo diff")).toBe("diff");
    expect(resolveRepositoryCommandIntent("/repo log")).toBe("log");
    expect(resolveRepositoryCommandIntent("what changed in this repo?")).toBe(
      undefined,
    );
  });

  it("executes slash commands through the action's repository facade", async () => {
    const runtime = {
      getService(serviceType: string) {
        return serviceType === "doolittle_coding_agent"
          ? {
              repoStatus: () => "working tree clean",
              repoDiff: () => "1 file changed",
              repoLog: () => "abc123 converge command handling",
            }
          : null;
      },
    };

    await expect(
      executeRepositoryCommand(runtime as never, "/repo status"),
    ).resolves.toBe("working tree clean");
    await expect(
      executeRepositoryCommand(runtime as never, "/repo diff"),
    ).resolves.toBe("1 file changed");
    await expect(
      executeRepositoryCommand(runtime as never, "/repo log"),
    ).resolves.toBe("abc123 converge command handling");
    await expect(
      executeRepositoryCommand(runtime as never, "/repo branch"),
    ).resolves.toBeUndefined();
  });
});
