import { describe, expect, it } from "vitest";
import {
  executeRepositoryCommand,
  resolveRepositoryIntentFromText,
} from "./repository-action";

describe("repository action command facade", () => {
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
