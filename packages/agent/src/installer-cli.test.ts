import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));

function runCommand(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  const sandboxHome = mkdtempSync(join(tmpdir(), "doolittle-e2e-"));
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: sandboxHome,
      XDG_CONFIG_HOME: join(sandboxHome, ".config"),
      CODEX_HOME: join(sandboxHome, ".codex"),
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      ...extraEnv,
    },
  });
  const output = `${Buffer.from(result.stdout).toString("utf8")}\n${Buffer.from(
    result.stderr,
  ).toString("utf8")}`.trim();
  rmSync(sandboxHome, { recursive: true, force: true });
  return {
    code: result.exitCode,
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
    expect(result.output).toContain("Install complete.");
  });

  it("bootstrap check reports preflight and completion", () => {
    const result = runCommand("bun", [
      "run",
      "scripts/bootstrap.ts",
      "--check",
    ]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Preflight");
    expect(result.output).toContain("Bootstrap check complete.");
  });

  it("launcher doctor works without onboarding state", () => {
    const result = runCommand("bun", ["packages/agent/src/index.ts", "doctor"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("mode: check");
    expect(result.output).toContain("Preflight");
    expect(result.output).toContain("Bootstrap check complete.");
  });
});
