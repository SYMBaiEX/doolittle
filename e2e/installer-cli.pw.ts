import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const ROOT = process.cwd();

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

test.describe("local installer and command smoke", () => {
  test("installer check reports first-contact flow and local command links", async () => {
    await test.step("run installer dry-run", async () => {
      const result = runCommand("bash", ["scripts/install.sh", "--check"]);
      expect(result.code).toBe(0);
      expect(result.output).toContain("ELIZA AGENT // INSTALLER");
      expect(result.output).toContain("Beginning the awakening sequence");
      expect(result.output).toContain("Would create:");
      expect(result.output).toContain("Install complete.");
    });
  });

  test("bootstrap check reports preflight and completion", async () => {
    await test.step("run bootstrap doctor flow", async () => {
      const result = runCommand("bun", [
        "run",
        "scripts/bootstrap.ts",
        "--check",
      ]);
      expect(result.code).toBe(0);
      expect(result.output).toContain("Preflight");
      expect(result.output).toContain("Bootstrap check complete.");
    });
  });

  test("launcher doctor works without onboarding state", async () => {
    await test.step("run local eliza-agent doctor", async () => {
      const result = runCommand("bun", [
        "packages/agent/src/index.ts",
        "doctor",
      ]);
      expect(result.code).toBe(0);
      expect(result.output).toContain("mode: check");
      expect(result.output).toContain("Preflight");
      expect(result.output).toContain("Bootstrap check complete.");
    });
  });
});
