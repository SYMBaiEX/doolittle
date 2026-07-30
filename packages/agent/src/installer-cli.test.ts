import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const NUB_PATH = join(
  ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "nub.cmd" : "nub",
);

function runCommand(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
  input?: string,
) {
  const sandboxHome = mkdtempSync(join(tmpdir(), "doolittle-e2e-"));
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: {
      ...environment,
      HOME: sandboxHome,
      XDG_CONFIG_HOME: join(sandboxHome, ".config"),
      CODEX_HOME: join(sandboxHome, ".codex"),
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      ...extraEnv,
    },
    encoding: "utf8",
    input,
    timeout: 30_000,
  });
  const output = `${result.stdout}\n${result.stderr}`.trim();
  rmSync(sandboxHome, { recursive: true, force: true });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output,
  };
}

describe("installer and launcher smoke tests", () => {
  it("installer check reports first-contact flow and local command links", () => {
    const result = runCommand("bash", ["scripts/install.sh", "--check"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("DOOLITTLE // INSTALLER");
    expect(result.output).toContain("Beginning the awakening sequence");
    expect(result.output).toContain("Would create:");
    expect(result.output).toContain(".local/bin/doolittle");
    expect(result.output).toContain("doolittle desktop");
    expect(result.output).toContain("Install check complete.");
  }, 30_000);

  it("bootstrap check reports preflight and completion", () => {
    const result = runCommand(NUB_PATH, ["scripts/bootstrap.ts", "--check"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Preflight");
    expect(result.output).toContain("Bootstrap check complete.");
  });

  it("launcher doctor works without onboarding state", () => {
    const result = runCommand(NUB_PATH, [
      "packages/agent/src/index.ts",
      "doctor",
    ]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("mode: check");
    expect(result.output).toContain("Preflight");
    expect(result.output).toContain("Bootstrap check complete.");
  });

  it("launches ACP through the installed CLI surface with protocol-clean stdout", () => {
    const result = runCommand(
      NUB_PATH,
      ["packages/agent/src/index.ts", "acp"],
      { DOOLITTLE_WORKSPACE_DIR: ROOT },
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1, clientCapabilities: {} },
      })}\n`,
    );

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("API listening");
    expect(result.stdout.trim()).toMatch(/^\{.+\}$/u);
    expect(JSON.parse(result.stdout)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: 1 },
    });
  }, 30_000);
});
