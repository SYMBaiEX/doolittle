import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
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
  const sandboxHome = mkdtempSync(join(tmpdir(), "eliza-agent-e2e-"));
  const result = spawnSync(command, args, {
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
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  rmSync(sandboxHome, { recursive: true, force: true });
  return {
    code: result.status ?? 1,
    output,
  };
}

describe("installer and launcher smoke tests", () => {
  it("installer check reports first-contact flow and local command links", () => {
    const result = runCommand("bash", ["scripts/install.sh", "--check"]);
    expect(result.code).toBe(0);
    expect(result.output).toContain("ELIZA AGENT // INSTALLER");
    expect(result.output).toContain("Beginning the awakening sequence");
    expect(result.output).toContain("Would create:");
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
