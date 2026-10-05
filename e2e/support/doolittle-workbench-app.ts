import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, type Page } from "@playwright/test";
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

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
        ...isolatedRuntimeEnvironment(join(profileDir, "runtime")),
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
        DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
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
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const state = await window.doolittle.getBackendState();
          return state.phase;
        }),
      { timeout: 45_000 },
    )
    .toBe("ready");
}

export async function openNewConversationView(page: Page): Promise<void> {
  const panels = page.locator("[data-session-panel]");
  const previousIds = new Set(
    await panels.evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("data-session-panel"))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  await page.locator('summary[aria-label="Conversation options"]').click();
  await page
    .getByRole("toolbar", { name: "Conversation controls" })
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect
    .poll(
      () =>
        panels.evaluateAll(
          (elements, knownIds) =>
            elements.some((element) => {
              const id = element.getAttribute("data-session-panel");
              return Boolean(id && !knownIds.includes(id));
            }),
          [...previousIds],
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function closeFocusedConversationView(page: Page): Promise<void> {
  await page.locator('summary[aria-label="Conversation options"]').click();
  await page.getByRole("button", { name: "Close view", exact: true }).click();
}
