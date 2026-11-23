import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildAcpRegistryEntry } from "../../packages/acp/src/registry";

vi.mock("node:fs", { spy: true });

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

it.runIf(process.platform !== "win32")(
  "publishes a shell that runs the configured command string",
  () => {
    const command = "echo ACP launcher works";
    const executable = existsSync("/bin/zsh") ? "/bin/zsh" : "/bin/sh";
    const args = ["-lc", command];
    expect(buildAcpRegistryEntry({ ...input, command }).distribution).toEqual({
      type: "command",
      command: executable,
      args,
    });
    const result = spawnSync(executable, args, {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("ACP launcher works");
  },
);

it.runIf(process.platform === "win32")(
  "passes a quoted command path and ACP stdio through Windows argv",
  () => {
    const dir = mkdtempSync(join(tmpdir(), "acp launcher "));
    try {
      const path = join(dir, "launch worker.cmd");
      writeFileSync(
        path,
        "@echo off\r\nset /p line=\r\necho %line%\r\nexit /b 17\r\n",
      );
      const command = `"${path}"`;
      const { distribution } = buildAcpRegistryEntry({ ...input, command });
      const executable = "powershell.exe";
      const flags = [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
      ];
      const script = distribution.args.at(-1);
      if (!script || !/^[A-Za-z0-9+/]+=*$/u.test(script))
        throw new Error("Expected a base64 encoded launcher.");
      const args = [...flags, script];
      expect(distribution).toEqual({
        type: "command",
        command: executable,
        args,
      });
      const result = spawnSync(executable, args, {
        encoding: "utf8",
        input: "ACP input\r\n",
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(17);
      expect(result.stdout.trim()).toBe("ACP input");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

it.runIf(process.platform !== "win32").each([
  [true, "/bin/zsh"],
  [false, "/bin/sh"],
])("selects %s zsh availability as %s", (available, shell) => {
  vi.mocked(existsSync).mockReturnValueOnce(available);
  const command = "source ~/.zshrc && doolittle acp";
  expect(buildAcpRegistryEntry({ ...input, command }).distribution).toEqual({
    type: "command",
    command: shell,
    args: ["-lc", command],
  });
});

it("keeps the default ACP argv when no custom command is configured", () => {
  expect(buildAcpRegistryEntry(input).distribution).toEqual({
    type: "command",
    command: "doolittle",
    args: ["acp"],
  });
});
