import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, type Page } from "@playwright/test";

const repoRoot = process.cwd();
const desktopRoot = resolve(repoRoot, "apps/desktop");

export interface IsolatedDesktop {
  app: Awaited<ReturnType<typeof electron.launch>>;
  page: Page;
  pageErrors: string[];
  profileDir: string;
  workspaceDir: string;
  dispose(): Promise<void>;
}

/** Launch only the built desktop app with an owned profile and empty workspace. */
export async function launchIsolatedDesktop(): Promise<IsolatedDesktop> {
  const profileDir = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-workbench-profile-")),
  );
  const workspaceDir = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-workbench-workspace-")),
  );
  writeFileSync(
    join(profileDir, "workspace-state.json"),
    `${JSON.stringify({ currentPath: workspaceDir, recentPaths: [workspaceDir] })}\n`,
    "utf8",
  );

  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: [desktopRoot, `--user-data-dir=${profileDir}`],
      cwd: repoRoot,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: "",
        ELIZAOS_CLOUD_API_KEY: "",
        FAL_API_KEY: "",
        OPENAI_API_KEY: "",
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
        DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
        DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
        ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
      },
    });

    const page = await app.firstWindow();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    return {
      app,
      page,
      pageErrors,
      profileDir,
      workspaceDir,
      async dispose() {
        try {
          await app?.close();
        } finally {
          removeOwnedTempDirectory(profileDir, "doolittle-workbench-profile-");
          removeOwnedTempDirectory(
            workspaceDir,
            "doolittle-workbench-workspace-",
          );
        }
      },
    };
  } catch (error) {
    if (app) await app.close();
    removeOwnedTempDirectory(profileDir, "doolittle-workbench-profile-");
    removeOwnedTempDirectory(workspaceDir, "doolittle-workbench-workspace-");
    throw error;
  }
}

function removeOwnedTempDirectory(path: string, prefix: string): void {
  const resolved = realpathSync(path);
  const tempRoot = realpathSync(tmpdir());
  if (!resolved.startsWith(`${tempRoot}/`)) {
    throw new Error("Refusing to remove a workbench test path outside tmpdir.");
  }
  if (!resolved.split("/").at(-1)?.startsWith(prefix)) {
    throw new Error("Refusing to remove an unowned workbench test path.");
  }
  rmSync(resolved, { recursive: true, force: true });
}

export async function waitForDesktopReady(page: Page): Promise<void> {
  await expect(page).toHaveTitle(/Doolittle$/);
  await expect(page.locator(".window-runtime-status")).toHaveAttribute(
    "aria-label",
    "Runtime status: ready",
    { timeout: 45_000 },
  );
}
