import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;

test.describe("packaged Doolittle desktop", () => {
  test.skip(!executablePath, "DOOLITTLE_DESKTOP_EXECUTABLE is required");

  test("boots the packaged preload bridge and shell", async () => {
    test.setTimeout(120_000);
    const profileDir = mkdtempSync(
      join(tmpdir(), "doolittle-packaged-profile-"),
    );
    const workspaceDir = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-packaged-workspace-")),
    );
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({
        currentPath: workspaceDir,
        recentPaths: [workspaceDir],
      })}\n`,
      "utf8",
    );
    const app = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${profileDir}`],
      env: {
        ...process.env,
        // A packaged app must ignore this source-only override.
        DOOLITTLE_DESKTOP_SOURCE_ROOT: join(profileDir, "not-a-checkout"),
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
        DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
      },
    });

    try {
      const page = await app.firstWindow();
      await expect(page).toHaveTitle(/Doolittle$/);
      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 60_000 },
      );
      await expect
        .poll(() => page.evaluate(() => typeof window.doolittle))
        .toBe("object");
      await page.evaluate(() => {
        window.location.hash = "#/settings";
      });
      await expect(page.locator(".window-context strong")).toHaveText(
        "Settings",
      );
    } finally {
      await app.close();
      rmSync(profileDir, { recursive: true, force: true });
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
