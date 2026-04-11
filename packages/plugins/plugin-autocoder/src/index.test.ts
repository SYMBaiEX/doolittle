import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
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

  test("stores secrets inside the injected data root", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-autocoder-"));
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
      storage: {
        dataRoot: root,
      },
    });
    const SecretsService = plugin.services?.[2] as ServiceClass | undefined;
    const service = (await SecretsService?.start(
      undefined as unknown as IAgentRuntime,
    )) as Service & {
      setSecret(key: string, value: string): { key: string };
      listSecretKeys(): string[];
    };

    expect(service.setSecret("OPENAI_API_KEY", "test-key")).toMatchObject({
      key: "OPENAI_API_KEY",
    });
    expect(service.listSecretKeys()).toEqual(["OPENAI_API_KEY"]);
  });
});
