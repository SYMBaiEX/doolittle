import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";
import {
  type View,
  views,
} from "../apps/desktop/src/renderer/desktop-navigation";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const profileDir = process.env.DOOLITTLE_DESKTOP_PROFILE_DIR;
const screenshotDir = process.env.DOOLITTLE_SWEEP_SCREENSHOTS_DIR?.trim();
const sweepExecutablePath = process.env.DOOLITTLE_SWEEP_EXECUTABLE_PATH?.trim();
const sweepExecutableSha256 =
  process.env.DOOLITTLE_SWEEP_EXECUTABLE_SHA256?.trim();
const sweepSourceRevision = process.env.DOOLITTLE_SWEEP_SOURCE_REVISION?.trim();

const desktopViewport = { width: 1440, height: 1000 } as const;
// Match the desktop window's supported compact width. Testing below minWidth
// makes Electron clamp the BrowserWindow while Playwright still assumes the
// requested size, which produces misleading geometry and screenshots.
const narrowViewport = { width: 920, height: 1000 } as const;

const routes = Array.from(views);

type RouteName = View;

type ScreenshotManifest = {
  schemaVersion: number;
  generatedAt: string;
  sourceRevision: string;
  routeCount: number;
  executable: {
    path: string;
    sha256: string;
  };
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

const interfaceModes = [
  { appearance: "dark", density: "comfortable", controlHeight: 32 },
  { appearance: "dark", density: "compact", controlHeight: 28 },
  { appearance: "light", density: "comfortable", controlHeight: 32 },
  { appearance: "light", density: "compact", controlHeight: 28 },
] as const;

async function applyInterfaceMode(
  page: Page,
  mode: (typeof interfaceModes)[number],
): Promise<void> {
  await page.evaluate(({ appearance, density }) => {
    window.dispatchEvent(
      new CustomEvent("doolittle:appearance-change", {
        detail: appearance,
      }),
    );
    window.dispatchEvent(
      new CustomEvent("doolittle:density-change", {
        detail: density,
      }),
    );
  }, mode);
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    mode.appearance,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-density",
    mode.density,
  );
  await waitForViewportLayout(page);
}

async function auditInterfaceModes(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  let auditedControls = 0;
  for (const mode of interfaceModes) {
    await applyInterfaceMode(page, mode);
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

      const controls = view.locator(
        '[class*="!h-[var(--control-height)]"]:visible',
      );
      const measurements = await controls.evaluateAll((elements) =>
        elements.map((element) => ({
          height: element.getBoundingClientRect().height,
          tag: element.tagName.toLowerCase(),
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 80) ??
            "",
        })),
      );
      auditedControls += measurements.length;
      for (const measurement of measurements) {
        expect(
          measurement.height,
          `${mode.appearance}/${mode.density} ${route} ${measurement.tag} ${measurement.label}`,
        ).toBeCloseTo(mode.controlHeight, 1);
      }

      const overflow = {
        document: await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
        view: await view.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
      };
      expect(
        overflow.document,
        `${mode.appearance}/${mode.density} ${route} document overflow`,
      ).toBeLessThanOrEqual(0);
      expect(
        overflow.view,
        `${mode.appearance}/${mode.density} ${route} view overflow`,
      ).toBeLessThanOrEqual(1);

      await expectViewportGeometry(page, route, mode, desktopViewport);
    }

    await resizeElectronWindow(app, narrowViewport);
    await waitForViewportLayout(page);
    await expectElectronViewport(page, narrowViewport);

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
      await expectViewportGeometry(page, route, mode, narrowViewport);
    }

    await resizeElectronWindow(app, desktopViewport);
    await waitForViewportLayout(page);
  }
  expect(auditedControls).toBeGreaterThan(0);
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
  if (!sweepSourceRevision || !sweepExecutablePath || !sweepExecutableSha256) {
    throw new Error(
      "Visual evidence provenance is missing. Use scripts/capture-desktop-visual.ts.",
    );
  }
  const manifest: ScreenshotManifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    sourceRevision: sweepSourceRevision,
    routeCount: audit.length,
    executable: {
      path: sweepExecutablePath,
      sha256: sweepExecutableSha256,
    },
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

async function resizeElectronWindow(
  app: ElectronApplication,
  viewport: { height: number; width: number },
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, dimensions) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("Doolittle window is unavailable.");
    window.setContentSize(dimensions.width, dimensions.height, false);
  }, viewport);
}

async function expectElectronViewport(
  page: Page,
  viewport: { height: number; width: number },
): Promise<void> {
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".desktop-shell");
    const rect = shell?.getBoundingClientRect();
    return {
      documentScrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      shell: rect
        ? {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          }
        : null,
    };
  });

  expect(metrics.innerWidth).toBe(viewport.width);
  expect(metrics.innerHeight).toBe(viewport.height);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(viewport.width);
  expect(metrics.shell).toEqual({
    height: viewport.height,
    left: 0,
    top: 0,
    width: viewport.width,
  });
}

async function expectViewportGeometry(
  page: Page,
  route: RouteName,
  mode: (typeof interfaceModes)[number],
  viewport: { height: number; width: number },
): Promise<void> {
  const geometry = await page.evaluate(
    ({ route, viewport }) => {
      const readBox = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          scrollWidth: element.scrollWidth,
          top: rect.top,
          width: rect.width,
        };
      };
      const view = document.querySelector<HTMLElement>(
        `.view-container[data-view="${route}"]`,
      );
      const rootStyle = getComputedStyle(document.documentElement);
      const sidebar = document.querySelector<HTMLElement>(".app-sidebar");
      const sidebarBox = readBox(".app-sidebar");

      return {
        composer: readBox(".chat-composer"),
        documentOverflow:
          document.documentElement.scrollWidth - window.innerWidth,
        dragbar: readBox(".window-dragbar--chat"),
        modelTrigger: readBox(".composer-model-trigger"),
        sidebar: sidebarBox
          ? {
              ...sidebarBox,
              hidden: sidebar?.getAttribute("aria-hidden") === "true",
            }
          : null,
        tokens: {
          controlHeight: Number.parseFloat(
            rootStyle.getPropertyValue("--control-height"),
          ),
          sidebarWidth: Number.parseFloat(
            rootStyle.getPropertyValue("--sidebar-width"),
          ),
          space: Number.parseFloat(rootStyle.getPropertyValue("--space-2")),
        },
        view: view
          ? {
              clientWidth: view.clientWidth,
              height: view.getBoundingClientRect().height,
              scrollWidth: view.scrollWidth,
              width: view.getBoundingClientRect().width,
            }
          : null,
        viewport,
      };
    },
    { route, viewport },
  );

  const label = `${mode.appearance}/${mode.density} ${route} ${viewport.width}px`;
  expect(geometry.view, `${label} route view`).not.toBeNull();
  expect(
    geometry.documentOverflow,
    `${label} document overflow`,
  ).toBeLessThanOrEqual(1);
  expect(
    geometry.view?.scrollWidth ?? Number.POSITIVE_INFINITY,
    `${label} route view width`,
  ).toBeLessThanOrEqual((geometry.view?.clientWidth ?? 0) + 1);
  expect(
    geometry.view?.width ?? 0,
    `${label} route view visible width`,
  ).toBeGreaterThan(0);
  expect(
    geometry.view?.width ?? Number.POSITIVE_INFINITY,
    `${label} route view fits viewport`,
  ).toBeLessThanOrEqual(viewport.width + 1);

  expect(geometry.sidebar, `${label} sidebar`).not.toBeNull();
  if (viewport.width > 940) {
    expect(
      geometry.sidebar?.hidden,
      `${label} desktop sidebar visibility`,
    ).toBeFalsy();
    expect(
      geometry.sidebar?.width ?? 0,
      `${label} desktop sidebar follows width token`,
    ).toBeGreaterThanOrEqual((geometry.tokens.sidebarWidth || 0) * 0.9);
    expect(
      geometry.sidebar?.width ?? Number.POSITIVE_INFINITY,
      `${label} desktop sidebar remains proportionate`,
    ).toBeLessThanOrEqual(
      Math.min(viewport.width * 0.5, (geometry.tokens.sidebarWidth || 0) * 1.1),
    );
  } else {
    expect(
      geometry.sidebar?.hidden,
      `${label} narrow sidebar closes`,
    ).toBeTruthy();
    expect(
      geometry.sidebar?.width ?? Number.POSITIVE_INFINITY,
      `${label} narrow sidebar remains a bounded overlay`,
    ).toBeLessThanOrEqual(Math.min(viewport.width * 0.88, 320) + 1);
  }

  if (route !== "chat") return;

  expect(geometry.dragbar, `${label} chat dragbar`).not.toBeNull();
  expect(geometry.composer, `${label} chat composer`).not.toBeNull();
  expect(geometry.modelTrigger, `${label} model selector`).not.toBeNull();

  const controlHeight = geometry.tokens.controlHeight;
  const spacing = geometry.tokens.space || 8;
  expect(controlHeight, `${label} control-height token`).toBeGreaterThan(0);
  expect(
    geometry.dragbar?.height ?? 0,
    `${label} chat dragbar density range`,
  ).toBeGreaterThanOrEqual(controlHeight + spacing);
  expect(
    geometry.dragbar?.height ?? Number.POSITIVE_INFINITY,
    `${label} chat dragbar density range`,
  ).toBeLessThanOrEqual(controlHeight + spacing * 3);
  expect(
    geometry.composer?.width ?? Number.POSITIVE_INFINITY,
    `${label} composer fits route view`,
  ).toBeLessThanOrEqual((geometry.view?.clientWidth ?? 0) - spacing * 2);
  expect(
    geometry.composer?.width ?? 0,
    `${label} composer remains usefully wide`,
  ).toBeGreaterThan(Math.min(320, (geometry.view?.clientWidth ?? 0) * 0.45));
  expect(
    geometry.composer?.height ?? 0,
    `${label} composer retains input and controls`,
  ).toBeGreaterThanOrEqual(controlHeight * 2.5);
  expect(
    geometry.modelTrigger?.height ?? 0,
    `${label} model selector follows density`,
  ).toBeGreaterThanOrEqual(controlHeight - spacing);
  expect(
    geometry.modelTrigger?.height ?? Number.POSITIVE_INFINITY,
    `${label} model selector follows density`,
  ).toBeLessThanOrEqual(controlHeight + spacing);
  expect(
    geometry.modelTrigger?.width ?? Number.POSITIVE_INFINITY,
    `${label} model selector remains contained`,
  ).toBeLessThanOrEqual(Math.min(310 + spacing * 2, viewport.width * 0.42));
}

async function captureRouteScreenshots(
  app: ElectronApplication,
  page: Page,
  route: RouteName,
  config: ScreenshotEvidenceConfig,
): Promise<{ desktopScreenshot: string; narrowScreenshot: string }> {
  const desktopPath = join(config.desktopDir, `${route}.png`);
  const narrowPath = join(config.narrowDir, `${route}.png`);
  const screenshotOptions = {
    animations: "disabled" as const,
    caret: "hide" as const,
    fullPage: false,
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

  await resizeElectronWindow(app, desktopViewport);
  await waitForViewportLayout(page);
  await expectElectronViewport(page, desktopViewport);
  await page.screenshot({
    ...screenshotOptions,
    path: desktopPath,
  });

  await resizeElectronWindow(app, narrowViewport);
  await waitForViewportLayout(page);
  await expectElectronViewport(page, narrowViewport);
  const closeNavigation = page.getByRole("button", {
    name: "Close navigation",
  });
  if (await closeNavigation.isVisible()) {
    await closeNavigation.click();
    await expect(page.locator("aside.app-sidebar")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect
      .poll(() =>
        page
          .locator("aside.app-sidebar")
          .evaluate((sidebar) => sidebar.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(1);
  }
  await page.screenshot({
    ...screenshotOptions,
    path: narrowPath,
  });

  await resizeElectronWindow(app, desktopViewport);
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
    test.setTimeout(360_000);
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

      await resizeElectronWindow(app, desktopViewport);
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
          ? await captureRouteScreenshots(app, page, route, screenshotEvidence)
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
        const tabCount = await view.getByRole("tab").count();
        for (let index = 0; index < tabCount; index += 1) {
          const tab = page
            .locator(".view-container:visible")
            .getByRole("tab")
            .nth(index);
          if (await tab.isVisible()) {
            const tabId = await tab.getAttribute("id");
            const panelId = await tab.getAttribute("aria-controls");
            await tab.click();
            await page.waitForTimeout(40);
            const selectedTab = tabId
              ? page.locator(`.view-container:visible #${tabId}`)
              : page
                  .locator(".view-container:visible")
                  .getByRole("tab")
                  .nth(index);
            await expect(selectedTab).toHaveAttribute("aria-selected", "true");
            if (panelId) {
              await expect(
                page.locator(".view-container:visible").locator(`#${panelId}`),
              ).toBeVisible();
            }
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

      await resizeElectronWindow(app, desktopViewport);
      await auditInterfaceModes(app, page);
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
