import { resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const profileDir = process.env.DOOLITTLE_DESKTOP_PROFILE_DIR;

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

test.describe("Doolittle cloned-profile control sweep", () => {
  test.skip(
    !executablePath || !profileDir,
    "Packaged app and cloned profile required.",
  );

  test("opens safe controls across every route without renderer failures", async () => {
    test.setTimeout(180_000);
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
        await page.waitForTimeout(180);

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

        const apiFailures =
          route === "runtime" || route === "compatibility"
            ? await page.evaluate(
                async (paths) => {
                  const responses = await Promise.all(
                    paths.map(async (path) => {
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
                    }),
                  );
                  return responses.filter((response) => response.status >= 400);
                },
                route === "runtime"
                  ? [
                      "/runtime/status",
                      "/runtime/account-pool",
                      "/autonomy/status",
                      "/gateway/health",
                      "/gateway/runtime",
                      "/runtime/plugins",
                      "/runtime/ecosystem",
                      "/insights",
                    ]
                  : ["/runtime/compatibility"],
              )
            : undefined;
        audit.push({
          route,
          badNotices: await view.locator(".notice.bad").allTextContents(),
          controls: await view
            .locator(
              'button, a[href], summary, input, select, textarea, [role="tab"]',
            )
            .count(),
          tabs: tabCount,
          ...(apiFailures?.length ? { apiFailures } : {}),
        });
        await expect(page.locator(".recovery-shell")).toHaveCount(0);
      }

      console.log(`DOOLITTLE_PROFILE_SWEEP=${JSON.stringify(audit)}`);
      expect(pageErrors, pageErrors.join("\n\n")).toEqual([]);
      expect(consoleErrors, consoleErrors.join("\n\n")).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
