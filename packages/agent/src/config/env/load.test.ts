import { spawnSync } from "node:child_process";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProcessEnv, resolveRepoEnvPath } from "./load";

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
const isolatedLoad = `
  import { loadProcessEnv } from "./packages/agent/src/config/env/load.ts";
  process.chdir(process.env.TEST_WORKSPACE_ROOT);
  const env = { INHERITED_MARKER: "parent" };
  const result = loadProcessEnv(process.env.TEST_APP_ROOT, { env });
  process.stdout.write(JSON.stringify({ result, env }));
`;

function loadFromWorkspace(appRoot: string, workspaceRoot: string) {
  const child = spawnSync("nub", ["-e", isolatedLoad], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      TEST_APP_ROOT: appRoot,
      TEST_WORKSPACE_ROOT: workspaceRoot,
    },
  });
  expect(child.status).toBe(0);
  return JSON.parse(child.stdout);
}

function withRoots(run: (appRoot: string, workspaceRoot: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "doolittle-env-load-"));
  const appRoot = join(root, "app");
  const workspaceRoot = join(root, "workspace");
  mkdirSync(appRoot);
  mkdirSync(workspaceRoot);
  try {
    run(appRoot, workspaceRoot);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("env loading", () => {
  it("uses only the application-root .env and preserves inherited values", () => {
    withRoots((appRoot, workspaceRoot) => {
      writeFileSync(
        join(appRoot, ".env"),
        "ENV_LOAD_MARKER=application\nINHERITED_MARKER=file\n",
      );
      writeFileSync(join(workspaceRoot, ".env"), "ENV_LOAD_MARKER=workspace\n");
      expect(resolveRepoEnvPath(appRoot)).toBe(join(appRoot, ".env"));
      expect(loadFromWorkspace(appRoot, workspaceRoot)).toEqual({
        result: {
          parsed: {
            ENV_LOAD_MARKER: "application",
            INHERITED_MARKER: "file",
          },
        },
        env: {
          ENV_LOAD_MARKER: "application",
          INHERITED_MARKER: "parent",
        },
      });
    });
  });

  it("does not load a workspace .env when the application file is absent", () => {
    withRoots((appRoot, workspaceRoot) => {
      writeFileSync(join(workspaceRoot, ".env"), "ENV_LOAD_MARKER=workspace\n");
      expect(loadFromWorkspace(appRoot, workspaceRoot)).toEqual({
        result: { parsed: {} },
        env: { INHERITED_MARKER: "parent" },
      });
    });
  });

  it("rejects a symlink without changing the environment", () => {
    withRoots((appRoot, workspaceRoot) => {
      writeFileSync(join(workspaceRoot, ".env"), "ENV_LOAD_MARKER=linked\n");
      symlinkSync(join(workspaceRoot, ".env"), join(appRoot, ".env"));
      const env: NodeJS.ProcessEnv = { INHERITED_MARKER: "parent" };

      expect(() => loadProcessEnv(appRoot, { env })).toThrow(
        "Unable to read application .env safely.",
      );
      expect(env).toEqual({ INHERITED_MARKER: "parent" });
    });
  });

  it("rejects a multiply linked file without changing the environment", () => {
    withRoots((appRoot, workspaceRoot) => {
      const source = join(workspaceRoot, ".env");
      writeFileSync(source, "ENV_LOAD_MARKER=linked\n");
      linkSync(source, join(appRoot, ".env"));
      const env: NodeJS.ProcessEnv = { INHERITED_MARKER: "parent" };

      expect(() => loadProcessEnv(appRoot, { env })).toThrow(
        "Unable to read application .env safely.",
      );
      expect(env).toEqual({ INHERITED_MARKER: "parent" });
    });
  });

  it.skipIf(process.platform === "win32")(
    "rejects a FIFO without changing the environment",
    () => {
      withRoots((appRoot) => {
        const created = spawnSync("mkfifo", [join(appRoot, ".env")]);
        expect(created.status).toBe(0);
        const env: NodeJS.ProcessEnv = { INHERITED_MARKER: "parent" };

        expect(() => loadProcessEnv(appRoot, { env })).toThrow(
          "Unable to read application .env safely.",
        );
        expect(env).toEqual({ INHERITED_MARKER: "parent" });
      });
    },
  );

  it("rejects an oversized file without changing the environment", () => {
    withRoots((appRoot) => {
      writeFileSync(join(appRoot, ".env"), "X".repeat(256 * 1024 + 1));
      const env: NodeJS.ProcessEnv = { INHERITED_MARKER: "parent" };

      expect(() => loadProcessEnv(appRoot, { env })).toThrow(
        "Unable to read application .env safely.",
      );
      expect(env).toEqual({ INHERITED_MARKER: "parent" });
    });
  });
});
