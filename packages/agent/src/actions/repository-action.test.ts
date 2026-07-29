import { describe, expect, it } from "vitest";
import {
  createRepositoryAction,
  executeRepositoryCommand,
  resolveRepositoryIntentFromText,
} from "./repository-action";

describe("repository action command facade", () => {
  it("lets the Eliza planner select and parameterize repository inspection", async () => {
    const action = createRepositoryAction({
      repository: {
        status: () => "working tree clean",
        diffStat: () => "1 file changed",
        recentCommits: () => "abc123 converge command handling",
      },
    } as never);
    const message = {
      content: { text: "Tell me about the project architecture." },
    } as never;

    await expect(action.validate({} as never, message)).resolves.toBe(true);
    await expect(
      action.handler({} as never, message, undefined, {
        parameters: { intent: "diff" },
      }),
    ).resolves.toMatchObject({
      success: true,
      text: "1 file changed",
      verifiedUserFacing: true,
    });
  });

  it("maps slash command syntax through the shared action intent parser", () => {
    expect(resolveRepositoryIntentFromText("/repo")).toBe("status");
    expect(resolveRepositoryIntentFromText("/repo diff")).toBe("diff");
    expect(resolveRepositoryIntentFromText("/repo log")).toBe("log");
  });

  it("executes slash commands through the action's repository facade", async () => {
    const services = {
      repository: {
        status: () => "working tree clean",
        diffStat: () => "1 file changed",
        recentCommits: () => "abc123 converge command handling",
      },
    };

    await expect(
      executeRepositoryCommand({} as never, services as never, "/repo status"),
    ).resolves.toBe("working tree clean");
    await expect(
      executeRepositoryCommand({} as never, services as never, "/repo diff"),
    ).resolves.toBe("1 file changed");
    await expect(
      executeRepositoryCommand({} as never, services as never, "/repo log"),
    ).resolves.toBe("abc123 converge command handling");
    await expect(
      executeRepositoryCommand({} as never, services as never, "/repo branch"),
    ).resolves.toBeUndefined();
  });
});
