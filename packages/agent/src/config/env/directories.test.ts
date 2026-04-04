import { describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  prepareManagedDirectories,
  resolveManagedDirectories,
} from "./directories";

describe("env directories", () => {
  it("resolves relative paths from the repo root and preserves absolute paths", () => {
    const directories = resolveManagedDirectories("/repo", {
      DOOLITTLE_DATA_DIR: ".doolittle",
      DOOLITTLE_SKILLS_DIR: "./packages/skills",
      DOOLITTLE_CRON_OUTPUT_DIR: "tmp/cron",
      DOOLITTLE_GATEWAY_DATA_DIR: "/var/tmp/gateway",
      DOOLITTLE_HOOKS_DIR: ".doolittle/hooks",
      DOOLITTLE_WORKSPACE_DIR: ".",
    });

    expect(directories).toEqual({
      dataDir: "/repo/.doolittle",
      skillsDir: "/repo/packages/skills",
      cronOutputDir: "/repo/tmp/cron",
      gatewayDataDir: "/var/tmp/gateway",
      hooksDir: "/repo/.doolittle/hooks",
      workspaceDir: "/repo",
    });
  });

  it("creates the managed directories and leaves workspace resolution as data only", () => {
    const root = join(tmpdir(), `doolittle-env-dirs-${Date.now()}`);
    const directories = resolveManagedDirectories(root, {
      DOOLITTLE_DATA_DIR: "data",
      DOOLITTLE_SKILLS_DIR: "skills",
      DOOLITTLE_CRON_OUTPUT_DIR: "cron",
      DOOLITTLE_GATEWAY_DATA_DIR: "gateway",
      DOOLITTLE_HOOKS_DIR: "hooks",
      DOOLITTLE_WORKSPACE_DIR: "workspace",
    });

    rmSync(root, { force: true, recursive: true });
    prepareManagedDirectories(directories);

    expect(existsSync(directories.dataDir)).toBe(true);
    expect(existsSync(directories.skillsDir)).toBe(true);
    expect(existsSync(directories.cronOutputDir)).toBe(true);
    expect(existsSync(directories.gatewayDataDir)).toBe(true);
    expect(existsSync(directories.hooksDir)).toBe(true);
    expect(existsSync(directories.workspaceDir)).toBe(false);

    rmSync(root, { force: true, recursive: true });
  });
});
