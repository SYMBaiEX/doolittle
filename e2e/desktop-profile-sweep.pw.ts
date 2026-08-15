import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const profileDir = process.env.DOOLITTLE_DESKTOP_PROFILE_DIR;
const screenshotDir = process.env.DOOLITTLE_SWEEP_SCREENSHOTS_DIR?.trim();

const desktopViewport = { width: 1440, height: 1000 } as const;
const narrowViewport = { width: 820, height: 1000 } as const;

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

type RouteName = (typeof routes)[number];

type ScreenshotManifest = {
  schemaVersion: number;
  generatedAt: string;
  executable: string;
  profile: {
    source: "scrubbed" | "explicit";
    warning?: string;
  };
  viewports: {
    desktop: {
      width: number;
      height: number;
    };
    narrow: {
      width: number;
      height: number;
    };
  };
  routes: Array<{
    route: RouteName;
    desktopScreenshot: string;
    narrowScreenshot: string;
    badNotices: string[];
    initialControls: number;
    controls: number;
    tabs: number;
    apiFailures?: Array<{ path: string; status: number; body: string }>;
  }>;
};

type ScreenshotEvidenceConfig = {
  desktopDir: string;
  narrowDir: string;
  manifestPath: string;
};

type RouteAudit = {
  route: RouteName;
  desktopScreenshot: string | null;
  narrowScreenshot: string | null;
  badNotices: string[];
  initialControls: number;
  controls: number;
  tabs: number;
  apiFailures?: Array<{ path: string; status: number; body: string }>;
};

function getExecutableId(rawExecutablePath: string | undefined): string {
  if (!rawExecutablePath?.trim()) {
    return "doolittle-desktop";
  }

  return basename(rawExecutablePath);
}

function normalizeScreenshotDir(
  rawScreenshotDir: string | undefined,
): ScreenshotEvidenceConfig | null {
  if (!rawScreenshotDir) {
    return null;
  }

  const root = resolve(rawScreenshotDir);
  return {
    desktopDir: join(root, "desktop"),
    narrowDir: join(root, "narrow"),
    manifestPath: join(root, "visual-manifest.json"),
  };
}

function cleanEvidenceDirectory(config: ScreenshotEvidenceConfig): void {
  for (const directory of [config.desktopDir, config.narrowDir]) {
    if (existsSync(directory)) {
      rmSync(directory, { force: true, recursive: true });
    }
    mkdirSync(directory, { recursive: true });
  }

  if (existsSync(config.manifestPath)) {
    rmSync(config.manifestPath, { force: true });
  }
}

function writeManifest(
  config: ScreenshotEvidenceConfig,
  audit: Array<{
    route: RouteName;
    desktopScreenshot: string;
    narrowScreenshot: string;
    badNotices: string[];
    initialControls: number;
    controls: number;
    tabs: number;
    apiFailures?: Array<{ path: string; status: number; body: string }>;
  }>,
  explicitProfileUsed: boolean,
): void {
  const manifest: ScreenshotManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    executable: getExecutableId(executablePath),
    profile: {
      source: explicitProfileUsed ? "explicit" : "scrubbed",
      ...(explicitProfileUsed
        ? {
            warning:
              "An explicit profile directory was provided; profile path is not recorded for safety.",
          }
        : {}),
    },
    viewports: {
      desktop: { ...desktopViewport },
      narrow: { ...narrowViewport },
    },
    routes: audit,
  };

  writeFileSync(
    config.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

function relativeScreenshotPath(
  route: RouteName,
  viewport: "desktop" | "narrow",
): string {
  return `${viewport}/${route}.png`;
}

async function waitForViewportLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function captureRouteScreenshots(
  page: Page,
  route: RouteName,
  config: ScreenshotEvidenceConfig,
): Promise<{ desktopScreenshot: string; narrowScreenshot: string }> {
  const desktopPath = join(config.desktopDir, `${route}.png`);
  const narrowPath = join(config.narrowDir, `${route}.png`);
  const screenshotOptions = {
    fullPage: true,
    animations: "disabled" as const,
    caret: "hide" as const,
  } as const;

  await page.evaluate((activeRoute) => {
    window.scrollTo(0, 0);
    const view = document.querySelector<HTMLElement>(
      `.view-container[data-view="${activeRoute}"]`,
    );
    if (!view) return;

    for (const element of [view, ...view.querySelectorAll<HTMLElement>("*")]) {
      if (element.scrollTop > 0) element.scrollTop = 0;
      if (element.scrollLeft > 0) element.scrollLeft = 0;
    }
  }, route);

  await page.setViewportSize(desktopViewport);
  await waitForViewportLayout(page);
  await page.screenshot({
    ...screenshotOptions,
    path: desktopPath,
  });

  await page.setViewportSize(narrowViewport);
  await waitForViewportLayout(page);
  await page.screenshot({
    ...screenshotOptions,
    path: narrowPath,
  });

  await page.setViewportSize(desktopViewport);
  await waitForViewportLayout(page);

  return {
    desktopScreenshot: relativeScreenshotPath(route, "desktop"),
    narrowScreenshot: relativeScreenshotPath(route, "narrow"),
  };
}

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

function createScrubbedProfile(): { profileDir: string; workspaceDir: string } {
  const profileDir = mkdtempSync(join(tmpdir(), "doolittle-packaged-profile-"));
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
  return { profileDir, workspaceDir };
}

const apiProbePaths: Partial<Record<RouteName, readonly string[]>> = {
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

test.describe("Doolittle packaged-profile control sweep", () => {
  test.skip(!executablePath, "Packaged app required.");

  test("opens safe controls across every route without renderer failures", async () => {
    test.setTimeout(180_000);
    const screenshotEvidence = normalizeScreenshotDir(screenshotDir);
    if (screenshotEvidence) {
      cleanEvidenceDirectory(screenshotEvidence);
    }

    const generatedProfile = profileDir ? null : createScrubbedProfile();
    const activeProfileDir = generatedProfile
      ? generatedProfile.profileDir
      : resolve(profileDir ?? "");
    if (!generatedProfile) sanitizeClonedRuntimeProfile(activeProfileDir);
    let app: Awaited<ReturnType<typeof electron.launch>> | undefined;

    try {
      app = await electron.launch({
        executablePath: resolve(executablePath as string),
        args: [`--user-data-dir=${activeProfileDir}`],
        env: {
          ...process.env,
          DOOLITTLE_DESKTOP_CWD:
            generatedProfile?.workspaceDir ?? process.env.DOOLITTLE_DESKTOP_CWD,
          DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
        },
      });
      const page = await app.firstWindow();
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      await page.setViewportSize(desktopViewport);
      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 60_000 },
      );

      const audit: RouteAudit[] = [];

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

        const routeScreenshots = screenshotEvidence
          ? await captureRouteScreenshots(page, route, screenshotEvidence)
          : null;

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
        const tabLabels = (await view.getByRole("tab").allTextContents()).map(
          (label) => label.trim(),
        );
        const tabCount = tabLabels.length;
        for (const label of tabLabels) {
          const tab = page
            .locator(".view-container:visible")
            .getByRole("tab", { exact: true, name: label });
          if (await tab.isVisible()) {
            await tab.click();
            await page.waitForTimeout(40);
            await expect(page.locator(".recovery-shell")).toHaveCount(0);
          }
        }

        const interactionView = page.locator(".view-container:visible");
        const disclosures = interactionView.locator("details > summary");
        const disclosureCount = Math.min(await disclosures.count(), 12);
        for (let index = 0; index < disclosureCount; index += 1) {
          const disclosure = disclosures.nth(index);
          if (await disclosure.isVisible()) await disclosure.click();
        }

        const refreshButtons = interactionView.getByRole("button", {
          name: /^Refresh/,
        });
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
          desktopScreenshot: routeScreenshots?.desktopScreenshot ?? null,
          narrowScreenshot: routeScreenshots?.narrowScreenshot ?? null,
          badNotices: await interactionView
            .locator(".notice.bad")
            .allTextContents(),
          initialControls,
          controls: await interactionView
            .locator(visibleControlSelector)
            .count(),
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

      if (screenshotEvidence) {
        writeManifest(
          screenshotEvidence,
          audit.map((entry) => ({
            route: entry.route,
            desktopScreenshot: entry.desktopScreenshot ?? "",
            narrowScreenshot: entry.narrowScreenshot ?? "",
            badNotices: entry.badNotices,
            initialControls: entry.initialControls,
            controls: entry.controls,
            tabs: entry.tabs,
            ...(entry.apiFailures?.length
              ? { apiFailures: entry.apiFailures }
              : {}),
          })),
          Boolean(profileDir),
        );
      }
    } finally {
      await app?.close();
      if (generatedProfile) {
        rmSync(generatedProfile.profileDir, { force: true, recursive: true });
        rmSync(generatedProfile.workspaceDir, { force: true, recursive: true });
      }
    }
  });
});
