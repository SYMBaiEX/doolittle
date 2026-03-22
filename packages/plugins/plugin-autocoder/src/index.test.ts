import { describe, expect, test } from "bun:test";
import { autocoderPlugin, createAutocoderPlugin } from ".";

describe("autocoderPlugin", () => {
  test("exposes code generation, github, and secrets services", () => {
    const plugin = createAutocoderPlugin({
      terminal: {
        run: async () => ({ ok: true }),
      },
      repository: {
        isRepository: () => false,
        status: async () => "clean",
        diffStat: async () => "no diff",
        recentCommits: async () => "none",
      },
      workspace: {
        rootDir: () => "/workspace",
      },
    });

    expect(plugin.name).toBe("@elizaos/plugin-autocoder");
    expect(plugin.services?.length).toBe(3);
    expect(autocoderPlugin.services?.length).toBe(3);
  });
});
