import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { buildAcpRegistryEntry } from "../../packages/acp/src/registry";

const input = {
  agentName: "Doolittle",
  description: "Test agent",
  package: {
    name: "doolittle",
    version: "1.0.0",
    workspaceCount: 0,
    pluginPackageCount: 0,
    rootPath: ".",
  },
  toolCount: 0,
};

it("publishes a platform launcher that runs the configured command string", () => {
  const command = "echo ACP launcher works";
  const { distribution } = buildAcpRegistryEntry({ ...input, command });
  expect(distribution).toEqual(
    process.platform === "win32"
      ? {
          type: "command",
          command: process.env.ComSpec?.trim() || "cmd.exe",
          args: ["/D", "/S", "/C", command],
        }
      : { type: "command", command: "/bin/sh", args: ["-lc", command] },
  );
  const result = spawnSync(distribution.command, distribution.args, {
    encoding: "utf8",
    timeout: 5_000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe("ACP launcher works");
});

it("keeps the default ACP argv when no custom command is configured", () => {
  expect(buildAcpRegistryEntry(input).distribution).toEqual({
    type: "command",
    command: "doolittle",
    args: ["acp"],
  });
});
