import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const profileDir = process.env.DOOLITTLE_DESKTOP_PROFILE_DIR;
const screenshotDir = process.env.DOOLITTLE_SWEEP_SCREENSHOTS_DIR?.trim();

function sanitizeClonedRuntimeProfile(root: string): void {
  const runtimeDir = join(resolve(root), "runtime");
  const transientPaths = [
    join(runtimeDir, "pglite", "eliza-pglite.lock"),
    join(runtimeDir, "pglite", "postmaster.pid"),
  ];
  for (const target of transientPaths) {
    if (existsSync(target)) rmSync(target, { force: true });
  }
}

const routes = [
  "dashboard",
  "chat",
  "code",
  "browser",
  "review",
  "orchestration",
  "media",
  "automations",
  "sessions",
  "gateway",
  "activity",
  "analytics",
  "models",
  "connections",
  "tools",
  "skills",
  "plugins",
  "memory",
  "profiles",
  "logs",
  "settings",
  "keys",
  "runtime",
  "compatibility",
  "registry",
  "operatorSetup",
  "docs",
] as const;

const apiProbePaths: Partial<
  Record<(typeof routes)[number], readonly string[]>
> = {
  code: [
    "/repo/summary",
    "/workspace/tree?depth=12",
    "/repo/changes",
    "/repo/log",
    "/repo/worktrees",
    "/repo/branches",
    "/repo/remotes",
    "/repo/stashes",
    "/repo/conflicts",
  ],
  activity: ["/activity?limit=200"],
  runtime: [
    "/runtime/status",
    "/runtime/account-pool",
    "/autonomy/status",
    "/gateway/health",
    "/gateway/runtime",
    "/runtime/plugins",
    "/runtime/ecosystem",
    "/insights",
  ],
  compatibility: ["/runtime/compatibility"],
};

test.describe("Doolittle cloned-profile control sweep", () => {
  test.skip(
    !executablePath || !profileDir,
    "Packaged app and cloned profile required.",
  );

  test("opens safe controls across every route without renderer failures", async () => {
    test.setTimeout(180_000);
    sanitizeClonedRuntimeProfile(profileDir as string);
    const app = await electron.launch({
      executablePath: resolve(executablePath as string),
      args: [`--user-data-dir=${resolve(profileDir as string)}`],
    });

    try {
      const page = await app.firstWindow();
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 60_000 },
      );

      const audit: Array<{
        route: string;
        badNotices: string[];
        initialControls: number;
        controls: number;
        tabs: number;
        apiFailures?: Array<{ path: string; status: number; body: string }>;
      }> = [];

      for (const route of routes) {
        await page.evaluate((nextRoute) => {
          window.location.hash = `#/${nextRoute}`;
        }, route);
        const view = page.locator(`.view-container[data-view="${route}"]`);
        await expect(view).toBeVisible();
        await expect(page.locator(".recovery-shell")).toHaveCount(0);
        await expect(
          view.getByText("Opening view…", { exact: true }),
        ).toHaveCount(0, { timeout: 15_000 });
        await expect(view.locator(".loading-block")).toHaveCount(0, {
          timeout: 15_000,
        });
        await page.waitForTimeout(80);

        const visibleControlSelector =
          'button:visible, a[href]:visible, summary:visible, input:visible, select:visible, textarea:visible, [role="tab"]:visible';
        const initialControls = await view
          .locator(visibleControlSelector)
          .count();
        if (route === "sessions") {
          const sessionRows = view.locator(".session-list-scroll .row-card");
          const sessionCount = await sessionRows.count();
          expect(sessionCount).toBeLessThanOrEqual(20);
          if (sessionCount === 20) {
            await expect(
              view.getByRole("button", { name: "Show 20 more" }),
            ).toBeVisible();
            expect(initialControls).toBeLessThanOrEqual(32);
          }
        }
        if (screenshotDir) {
          await page.screenshot({
            animations: "disabled",
            path: `${screenshotDir}/${route}.png`,
          });
        }

        const tabs = view.getByRole("tab");
        const tabCount = await tabs.count();
        for (let index = 0; index < tabCount; index += 1) {
          const tab = tabs.nth(index);
          if (await tab.isVisible()) {
            await tab.click();
            await page.waitForTimeout(40);
            await expect(page.locator(".recovery-shell")).toHaveCount(0);
          }
        }

        const disclosures = view.locator("details > summary");
        const disclosureCount = Math.min(await disclosures.count(), 12);
        for (let index = 0; index < disclosureCount; index += 1) {
          const disclosure = disclosures.nth(index);
          if (await disclosure.isVisible()) await disclosure.click();
        }

        const refreshButtons = view.getByRole("button", { name: /^Refresh/ });
        const refreshCount = Math.min(await refreshButtons.count(), 6);
        for (let index = 0; index < refreshCount; index += 1) {
          const refresh = refreshButtons.nth(index);
          if (await refresh.isVisible()) {
            await refresh.click();
            await page.waitForTimeout(40);
          }
        }

        const probePaths = apiProbePaths[route];
        const apiFailures = probePaths
          ? await page.evaluate(async (paths) => {
              const responses = await Promise.all(
                paths.map(async (path) => {
                  try {
                    const response = await window.doolittle.requestAgent({
                      path,
                      method: "GET",
                      headers: { accept: "application/json" },
                    });
                    return {
                      path,
                      status: response.status,
                      body: response.body.slice(0, 320),
                    };
                  } catch (error) {
                    return {
                      path,
                      status: 0,
                      body:
                        error instanceof Error ? error.message : String(error),
                    };
                  }
                }),
              );
              return responses.filter(
                (response) => response.status === 0 || response.status >= 400,
              );
            }, probePaths)
          : undefined;
        audit.push({
          route,
          badNotices: await view.locator(".notice.bad").allTextContents(),
          initialControls,
          controls: await view.locator(visibleControlSelector).count(),
          tabs: tabCount,
          ...(apiFailures?.length ? { apiFailures } : {}),
        });
        await expect(page.locator(".recovery-shell")).toHaveCount(0);
      }

      console.log(`DOOLITTLE_PROFILE_SWEEP=${JSON.stringify(audit)}`);
      expect(
        audit.flatMap((entry) =>
          entry.badNotices.map((notice) => `${entry.route}: ${notice}`),
        ),
      ).toEqual([]);
      expect(
        audit.flatMap((entry) =>
          (entry.apiFailures ?? []).map(
            (failure) =>
              `${entry.route} ${failure.path}: ${failure.status} ${failure.body}`,
          ),
        ),
      ).toEqual([]);
      expect(pageErrors, pageErrors.join("\n\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n\n")).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
