import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BackendManager,
  buildBackendEnvironment,
  isRecoverablePgliteStartupFailure,
  preserveFailedPgliteDataDir,
} from "./backend";

describe("buildBackendEnvironment", () => {
  it("isolates every mutable runtime directory from the checkout", () => {
    const runtimeDataDir = resolve("/tmp", "doolittle-desktop-runtime");
    const repoRoot = resolve("/opt", "doolittle", "runtime");
    const workspaceDir = resolve("/Users", "example", "project");
    const environment = buildBackendEnvironment(
      runtimeDataDir,
      repoRoot,
      workspaceDir,
      {
        DATABASE_URL: "postgres://checkout",
        POSTGRES_URL: "postgres://checkout",
        DOOLITTLE_GATEWAY_DATA_DIR: ".doolittle/gateway",
      },
    );

    expect(environment).toMatchObject({
      DOOLITTLE_REPO_ROOT: repoRoot,
      DOOLITTLE_HOST: "127.0.0.1",
      DOOLITTLE_PORT: "0",
      DOOLITTLE_MODE: "api",
      DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
      DOOLITTLE_USE_LINKED_DEVIN_AUTH: "false",
      DOOLITTLE_DATA_DIR: runtimeDataDir,
      DOOLITTLE_SKILLS_DIR: resolve(repoRoot, "packages", "skills"),
      ELIZAOS_BUNDLED_SKILLS_DIR: resolve(repoRoot, "packages", "skills"),
      DOOLITTLE_WORKSPACE_DIR: workspaceDir,
      DOOLITTLE_CRON_OUTPUT_DIR: resolve(runtimeDataDir, "cron-output"),
      DOOLITTLE_GATEWAY_DATA_DIR: resolve(runtimeDataDir, "gateway"),
      DOOLITTLE_HOOKS_DIR: resolve(runtimeDataDir, "hooks"),
      PGLITE_DATA_DIR: resolve(runtimeDataDir, "pglite"),
      DATABASE_URL: "",
      POSTGRES_URL: "",
    });
  });

  it("uses the mutable workspace on the next backend restart", async () => {
    const initialWorkspace = resolve("/Users", "example", "initial");
    const nextWorkspace = resolve("/Users", "example", "next");
    const backend = new BackendManager(
      {
        executable: "unused",
        args: [],
        repoRoot: resolve("/opt", "doolittle", "runtime"),
      },
      resolve("/tmp", "doolittle-desktop-runtime"),
      initialWorkspace,
    );
    let restarts = 0;
    backend.restart = async () => {
      restarts += 1;
      return backend.getState();
    };

    await backend.switchWorkspace(nextWorkspace);
    expect(backend.getWorkspaceDirectory()).toBe(nextWorkspace);
    expect(restarts).toBe(1);

    await backend.switchWorkspace(nextWorkspace);
    expect(restarts).toBe(1);
    expect(
      buildBackendEnvironment(
        resolve("/tmp", "doolittle-desktop-runtime"),
        resolve("/opt", "doolittle", "runtime"),
        backend.getWorkspaceDirectory(),
      ).DOOLITTLE_WORKSPACE_DIR,
    ).toBe(nextWorkspace);
  });
});

describe("packaged PGlite recovery", () => {
  it("recognizes database initialization failures without matching unrelated exits", () => {
    expect(
      isRecoverablePgliteStartupFailure(
        "[PLUGIN:SQL] PGlite initialization still failed: Aborted()",
      ),
    ).toBe(true);
    expect(
      isRecoverablePgliteStartupFailure(
        "Doolittle API failed because port 8080 is already in use",
      ),
    ).toBe(false);
  });

  it("preserves the failed database before preparing a clean retry directory", () => {
    const runtimeDataDir = mkdtempSync(
      join(tmpdir(), "doolittle-desktop-recovery-"),
    );
    const dataDir = join(runtimeDataDir, "pglite");
    const marker = join(dataDir, "PG_VERSION");
    try {
      mkdirSync(dataDir);
      writeFileSync(marker, "17");
      const backupDir = preserveFailedPgliteDataDir(runtimeDataDir, 1234);

      expect(backupDir).toBe(`${dataDir}.failed-1234`);
      expect(existsSync(dataDir)).toBe(true);
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(join(backupDir as string, "PG_VERSION"))).toBe(true);
    } finally {
      rmSync(runtimeDataDir, { recursive: true, force: true });
      rmSync(`${dataDir}.failed-1234`, { recursive: true, force: true });
    }
  });
});
