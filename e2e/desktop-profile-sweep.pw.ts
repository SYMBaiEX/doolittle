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
  desktopHashForView,
  type View,
  views,
} from "../apps/desktop/src/renderer/desktop-navigation";
import { isolatedRuntimeEnvironment } from "./support/isolated-runtime-environment";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const profileDir = process.env.DOOLITTLE_DESKTOP_PROFILE_DIR;
const screenshotDir = process.env.DOOLITTLE_SWEEP_SCREENSHOTS_DIR?.trim();
const sweepExecutablePath = process.env.DOOLITTLE_SWEEP_EXECUTABLE_PATH?.trim();
const sweepExecutableSha256 =
  process.env.DOOLITTLE_SWEEP_EXECUTABLE_SHA256?.trim();
const sweepAppAsarSha256 = process.env.DOOLITTLE_SWEEP_APP_ASAR_SHA256?.trim();
const sweepSourceRevision = process.env.DOOLITTLE_SWEEP_SOURCE_REVISION?.trim();

const desktopViewport = { width: 1440, height: 1000 } as const;
// Exercise the real mobile shell rather than stopping at the old native
// 920px clamp. The BrowserWindow minimum is intentionally aligned to 360px.
const narrowViewport = { width: 375, height: 812 } as const;
const responsiveAuditViewports = [
  // Keep the wide contract inside the smallest supported macOS work area so
  // Electron does not clamp the requested content height behind the menu bar.
  { width: 1680, height: 1000 },
  { width: 1180, height: 900 },
  { width: 1024, height: 900 },
  { width: 920, height: 900 },
  { width: 768, height: 900 },
  { width: 540, height: 800 },
  { width: 360, height: 480 },
] as const;

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
    appAsarSha256: string;
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
  { appearance: "dark", density: "comfortable", controlHeight: 36 },
  { appearance: "dark", density: "compact", controlHeight: 32 },
  { appearance: "light", density: "comfortable", controlHeight: 36 },
  { appearance: "light", density: "compact", controlHeight: 32 },
] as const;

const importedThemeBundle = {
  kind: "doolittle.theme",
  version: 1,
  appearance: "light",
  density: "compact",
  theme: {
    name: "profile-sweep-violet",
    label: "Profile sweep violet",
    tagline: "An end-to-end imported theme probe.",
    primary: "#6d28d9",
    secondary: "#a855f7",
    amberGlow: "#c084fc",
    greenGlow: "#4d7c0f",
    cyanGlow: "#0891b2",
    magentaGlow: "#db2777",
    muted: "#6b7280",
    baseBg: "#101828",
    baseFg: "#e2e8f0",
    panelBg: "#172554",
  },
} as const;

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
  for (const route of routes) {
    await resizeElectronWindow(app, desktopViewport);
    await waitForViewportLayout(page);
    await expectElectronViewport(page, desktopViewport);
    await navigateToRoute(page, route);

    for (const mode of interfaceModes) {
      await applyInterfaceMode(page, mode);
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

    for (const mode of interfaceModes) {
      await applyInterfaceMode(page, mode);
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
    await expectElectronViewport(page, desktopViewport);
  }
  expect(auditedControls).toBeGreaterThan(0);
  console.log(
    `DOOLITTLE_INTERFACE_MODES=${JSON.stringify({
      routes: routes.length,
      modes: interfaceModes.length,
      viewports: 2,
      geometryChecks: routes.length * interfaceModes.length * 2,
      auditedControls,
    })}`,
  );
}

async function setNativeTheme(
  app: ElectronApplication,
  source: "dark" | "light" | "system",
): Promise<{ shouldUseDarkColors: boolean; source: string }> {
  return app.evaluate(({ nativeTheme }, nextSource) => {
    nativeTheme.themeSource = nextSource;
    return {
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      source: nativeTheme.themeSource,
    };
  }, source);
}

async function expectThemeSurfaces(
  page: Page,
  expected: {
    appearance: "dark" | "light";
    theme?: string;
    accent?: string;
    require?: Array<"composer" | "editor" | "shell" | "terminal">;
  },
): Promise<void> {
  const surfaces = await page.evaluate(() => {
    const resolveColor = (property: string) => {
      const probe = document.createElement("i");
      probe.style.color = `var(${property})`;
      probe.hidden = true;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        background: style.backgroundColor,
        border: style.borderColor,
        color: style.color,
      };
    };
    const root = document.documentElement;
    return {
      appearance: root.dataset.appearance,
      appearancePreference: root.dataset.appearancePreference,
      accent: resolveColor("--accent"),
      background: resolveColor("--bg"),
      canvas: resolveColor("--canvas-bg"),
      text: resolveColor("--canvas-text"),
      theme: root.dataset.theme,
      shell: read(".desktop-shell"),
      composer: read(".chat-composer"),
      editor: read(".doolittle-code-editor"),
      terminal: read("[aria-label='Terminal output'] .xterm-viewport"),
    };
  });

  expect(surfaces.appearance).toBe(expected.appearance);
  const required = new Set(expected.require ?? []);
  if (required.has("shell")) {
    expect(surfaces.shell, "desktop shell is mounted").not.toBeNull();
    expect(surfaces.shell?.background).toBe(surfaces.background);
  }
  if (required.has("composer")) {
    expect(surfaces.composer, "chat composer is mounted").not.toBeNull();
    expect(surfaces.composer?.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(surfaces.composer?.border).not.toBe("rgba(0, 0, 0, 0)");
  }
  if (required.has("editor")) {
    expect(surfaces.editor, "Monaco host is mounted").not.toBeNull();
    expect(surfaces.editor?.background).toBe(surfaces.canvas);
  }
  if (required.has("terminal")) {
    expect(surfaces.terminal, "xterm viewport is mounted").not.toBeNull();
    expect(surfaces.terminal?.background).toBe(surfaces.canvas);
    expect(surfaces.terminal?.color).toBe(surfaces.text);
  }
  if (expected.theme) expect(surfaces.theme).toBe(expected.theme);
  if (expected.accent) expect(surfaces.accent).toBe(expected.accent);
}

async function auditThemeResponsiveness(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  await resizeElectronWindow(app, desktopViewport);
  await navigateToRoute(page, "chat");
  await expect(page.locator(".chat-composer")).toBeVisible();

  // Open one real terminal and one real Monaco editor before changing themes.
  // This proves their canvas surfaces react to the same live token changes as
  // the shell and composer, rather than only proving static CSS contracts.
  // Earlier route sweeps can leave the terminal open. Its close transition
  // intentionally keeps the panel mounted for 210ms, so blindly toggling it
  // here can sample the outgoing terminal instead of opening one. Inspect
  // the semantic state first, then assert the live panel is open before
  // asserting xterm's canvas surface.
  const chatTerminalPanel = page.getByLabel("Chat terminal panel");
  const terminalAlreadyOpen =
    (await chatTerminalPanel.count()) > 0 &&
    (await chatTerminalPanel.getAttribute("data-open")) === "true";
  if (!terminalAlreadyOpen) {
    await page.getByRole("textbox", { name: "Message Doolittle" }).focus();
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+J" : "Control+J",
    );
  }
  await expect(chatTerminalPanel).toHaveAttribute("data-open", "true");
  await expect(chatTerminalPanel).toBeVisible();
  await expect(
    page.locator("[aria-label='Terminal output'] .xterm-viewport"),
  ).toBeVisible({ timeout: 15_000 });

  // Explicit appearances must remain deterministic regardless of the OS.
  await applyInterfaceMode(page, interfaceModes[0]);
  await expectThemeSurfaces(page, {
    appearance: "dark",
    require: ["shell", "composer", "terminal"],
  });
  await applyInterfaceMode(page, interfaceModes[2]);
  await expectThemeSurfaces(page, {
    appearance: "light",
    require: ["shell", "composer", "terminal"],
  });

  await navigateToRoute(page, "code");
  // The prior control sweep intentionally exercises every Explorer view. Code
  // preserves that selection, so enter Files explicitly before requiring its
  // real workspace tree rather than depending on cross-sweep tab state.
  const explorerViews = page.getByRole("tablist", { name: "Explorer views" });
  const filesTab = explorerViews.getByRole("tab", {
    name: "Files",
    exact: true,
  });
  await expect(explorerViews).toBeVisible();
  if ((await filesTab.getAttribute("aria-selected")) !== "true") {
    await filesTab.click();
  }
  await expect(filesTab).toHaveAttribute("aria-selected", "true");
  const workspaceTree = page.getByRole("tree", { name: "Workspace files" });
  await expect(workspaceTree).toBeVisible({ timeout: 15_000 });
  const fixtureFile = workspaceTree.getByRole("treeitem", {
    name: "theme-sweep.ts",
    exact: true,
  });
  const firstWorkspaceFile = workspaceTree
    .getByRole("treeitem")
    .filter({ hasNot: page.locator("[aria-expanded]") })
    .first();
  if (await fixtureFile.isVisible()) await fixtureFile.click();
  else await firstWorkspaceFile.click();
  await expect(
    page.locator(".doolittle-code-editor .monaco-editor"),
  ).toBeVisible({ timeout: 15_000 });

  // Electron's nativeTheme drives the actual renderer media query. Playwright
  // starts Electron pages with an emulated light scheme, which masks that
  // native signal; remove the harness override before proving System mode
  // follows native dark and light transitions.
  await page.emulateMedia({ colorScheme: null });
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("doolittle:appearance-change", { detail: "system" }),
    );
  });
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance-preference",
    "system",
  );
  expect(await setNativeTheme(app, "dark")).toEqual({
    shouldUseDarkColors: true,
    source: "dark",
  });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        appearance: document.documentElement.dataset.appearance,
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      })),
    )
    .toEqual({ appearance: "dark", prefersDark: true });
  await expectThemeSurfaces(page, {
    appearance: "dark",
    require: ["shell", "editor", "terminal"],
  });
  expect(await setNativeTheme(app, "light")).toEqual({
    shouldUseDarkColors: false,
    source: "light",
  });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        appearance: document.documentElement.dataset.appearance,
        prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      })),
    )
    .toEqual({ appearance: "light", prefersDark: false });

  await navigateToRoute(page, "settings");
  const importInput = page.getByLabel("Import Doolittle theme file");
  await expect(importInput).toBeAttached();
  await importInput.setInputFiles({
    name: "profile-sweep.doolittle-theme.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(importedThemeBundle)),
  });
  await expect(
    page.getByText("Profile sweep violet was imported and applied."),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme",
    importedThemeBundle.theme.name,
  );
  await expect(page.locator("html")).toHaveAttribute(
    "data-appearance",
    "light",
  );
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("doolittle.desktop.theme-source"),
      ),
    )
    .toBe("imported");

  await navigateToRoute(page, "code");
  await waitForViewportLayout(page);
  await expect(
    page.locator(".doolittle-code-editor .monaco-editor"),
  ).toBeVisible({ timeout: 15_000 });
  await expectThemeSurfaces(page, {
    appearance: "light",
    theme: importedThemeBundle.theme.name,
    accent: "rgb(109, 40, 217)",
    require: ["shell", "editor", "terminal"],
  });
  await navigateToRoute(page, "chat");
  await waitForViewportLayout(page);
  await expectThemeSurfaces(page, {
    appearance: "light",
    theme: importedThemeBundle.theme.name,
    accent: "rgb(109, 40, 217)",
    require: ["shell", "composer", "terminal"],
  });
  await setNativeTheme(app, "system");
  console.log(
    "DOOLITTLE_THEME_RESPONSIVENESS=" +
      JSON.stringify({
        explicitAppearances: 2,
        nativeSystemTransitions: 2,
        importedThemeApplied: true,
        surfaces: ["shell", "composer", "editor", "terminal"],
      }),
  );
}

async function auditResponsiveRoutes(
  app: ElectronApplication,
  page: Page,
): Promise<void> {
  const mode = interfaceModes.at(-1);
  if (!mode) throw new Error("Interface mode matrix is empty.");

  for (const route of routes) {
    await resizeElectronWindow(app, responsiveAuditViewports[0]);
    await waitForViewportLayout(page);
    await navigateToRoute(page, route);

    for (const viewport of responsiveAuditViewports) {
      await resizeElectronWindow(app, viewport);
      await waitForViewportLayout(page);
      await expectElectronViewport(page, viewport);
      const view = page.locator(`.view-container[data-view="${route}"]`);
      await expect
        .poll(
          () =>
            page.evaluate(() => ({
              activeView:
                document
                  .querySelector<HTMLElement>(".view-container[data-view]")
                  ?.getAttribute("data-view") ?? null,
              hash: window.location.hash,
            })),
          {
            message: `${viewport.width}px navigation reaches ${route}`,
            timeout: 15_000,
          },
        )
        .toEqual({ activeView: route, hash: desktopHashForView(route) });
      await expect(view).toBeVisible();
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      await expect(
        view.getByText("Opening view…", { exact: true }),
      ).toHaveCount(0, { timeout: 15_000 });

      const overflow = await page.evaluate((activeRoute) => {
        const activeView = document.querySelector<HTMLElement>(
          `.view-container[data-view="${activeRoute}"]`,
        );
        return {
          document: document.documentElement.scrollWidth - window.innerWidth,
          view: activeView
            ? activeView.scrollWidth - activeView.clientWidth
            : Number.POSITIVE_INFINITY,
        };
      }, route);
      expect(
        overflow.document,
        `${viewport.width}px ${route} document overflow`,
      ).toBeLessThanOrEqual(0);
      expect(
        overflow.view,
        `${viewport.width}px ${route} view overflow`,
      ).toBeLessThanOrEqual(1);
      await expectViewportGeometry(page, route, mode, viewport);
    }
  }

  await resizeElectronWindow(app, desktopViewport);
  await waitForViewportLayout(page);
  console.log(
    `DOOLITTLE_RESPONSIVE_ROUTES=${JSON.stringify({
      routes: routes.length,
      viewports: responsiveAuditViewports.length,
      geometryChecks: routes.length * responsiveAuditViewports.length,
      mode: `${mode.appearance}/${mode.density}`,
    })}`,
  );
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
  if (
    !sweepSourceRevision ||
    !sweepExecutablePath ||
    !sweepExecutableSha256 ||
    !sweepAppAsarSha256
  ) {
    throw new Error(
      "Visual evidence provenance is missing. Use scripts/capture-desktop-visual.ts.",
    );
  }
  const manifest: ScreenshotManifest = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    sourceRevision: sweepSourceRevision,
    routeCount: audit.length,
    executable: {
      path: sweepExecutablePath,
      sha256: sweepExecutableSha256,
      appAsarSha256: sweepAppAsarSha256,
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
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.setTimeout(resolve, 220)),
        );
      }),
  );
}

async function navigateToRoute(page: Page, route: RouteName) {
  await page.evaluate((nextRoute) => {
    const oldURL = window.location.href;
    window.history.replaceState(window.history.state, "", `#/${nextRoute}`);
    window.dispatchEvent(
      new HashChangeEvent("hashchange", {
        newURL: window.location.href,
        oldURL,
      }),
    );
  }, route);
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
  if (route === "chat") {
    const activeConversation = page
      .locator(
        '.view-container[data-view="chat"] [data-session-panel]:not([hidden]) .chat-conversation',
      )
      .first();
    // These controls are unconditional, even when Send is legitimately
    // disabled. Optional-action filtering must never hide their disappearance.
    await expect(
      activeConversation.getByRole("button", {
        name: "Attach multiple files",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      activeConversation.locator(".chat-composer-submit"),
    ).toBeVisible();
    await expect(
      activeConversation.locator(".composer-model-trigger"),
    ).toBeVisible();
    if (viewport.height <= 640) {
      const composer = activeConversation.locator(".chat-composer");
      await composer.scrollIntoViewIfNeeded();
      const shortLayout = await composer.evaluate((form) => {
        const route = form.closest<HTMLElement>(".view-container");
        const transcript = form
          .closest(".chat-conversation")
          ?.querySelector(".chat-messages");
        const formRect = form.getBoundingClientRect();
        const routeRect = route?.getBoundingClientRect();
        return {
          overflowY: route ? getComputedStyle(route).overflowY : null,
          shellHeight: document
            .querySelector(".desktop-shell")
            ?.getBoundingClientRect().height,
          transcriptHeight: transcript?.getBoundingClientRect().height,
          transcriptTop: transcript?.getBoundingClientRect().top,
          transcriptBottom: transcript?.getBoundingClientRect().bottom,
          formTop: formRect.top,
          formBottom: formRect.bottom,
          routeTop: routeRect?.top,
          routeBottom: routeRect?.bottom,
        };
      });
      expect(
        shortLayout.overflowY,
        "short Chat has an intentional scroll boundary",
      ).toBe("auto");
      expect(
        shortLayout.shellHeight,
        "short shell remains viewport bounded",
      ).toBe(viewport.height);
      expect(
        shortLayout.transcriptHeight,
        "short transcript retains readable scrolling space",
      ).toBeGreaterThanOrEqual(128);
      expect(
        shortLayout.formTop,
        "scrolled composer top stays inside Chat view",
      ).toBeGreaterThanOrEqual((shortLayout.routeTop ?? Infinity) - 1);
      expect(
        shortLayout.formBottom,
        "scrolled composer bottom stays inside Chat view",
      ).toBeLessThanOrEqual((shortLayout.routeBottom ?? 0) + 1);
      expect(
        shortLayout.transcriptTop,
        "readable transcript top stays inside Chat view",
      ).toBeGreaterThanOrEqual((shortLayout.routeTop ?? Infinity) - 1);
      expect(
        shortLayout.transcriptBottom,
        "readable transcript bottom stays inside Chat view",
      ).toBeLessThanOrEqual((shortLayout.routeBottom ?? 0) + 1);

      const opener = page.getByRole("button", { name: /^Open terminal/ });
      await expect(opener).toBeVisible();
      const openerBox = await opener.boundingBox();
      expect(
        openerBox?.height,
        "terminal opener touch height",
      ).toBeGreaterThanOrEqual(44);
      expect(
        openerBox?.width,
        "terminal opener touch width",
      ).toBeGreaterThanOrEqual(44);
      const terminal = await page
        .locator(
          '[aria-label="Chat terminal panel"] [data-interactive-terminal]',
        )
        .elementHandle();
      if (!terminal) throw new Error("Retained terminal is unavailable");
      try {
        await opener.click();
        const dialog = page.getByRole("dialog", {
          name: "Chat terminal",
          exact: true,
        });
        await expect(dialog).toBeVisible();
        const returnBox = await dialog
          .getByRole("button", { name: "Back to workspace", exact: true })
          .boundingBox();
        expect(
          returnBox?.height,
          "terminal return touch height",
        ).toBeGreaterThanOrEqual(44);
        const bounds = await dialog.boundingBox();
        expect(bounds).toEqual({
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
        });
        expect(
          await terminal.evaluate(
            (element) =>
              element ===
              document.querySelector(
                '[aria-label="Chat terminal panel"] [data-interactive-terminal]',
              ),
          ),
        ).toBe(true);
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
        await expect(opener).toBeFocused();
        expect(
          await terminal.evaluate(
            (element) =>
              element.isConnected && Boolean(element.closest("[inert]")),
          ),
        ).toBe(true);
      } finally {
        await terminal.dispose();
      }
    }
  }
  const geometry = await page.evaluate(
    ({ route, viewport }) => {
      const readBox = (selector: string, root: ParentNode = document) => {
        const element = root.querySelector<HTMLElement>(selector);
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
      // A retained chat tree is not the active route/pane. Measure the real
      // visible conversation, whose named session container owns its controls.
      const conversation = view?.querySelector<HTMLElement>(
        "[data-session-panel]:not([hidden]) .chat-conversation",
      );
      const composer =
        conversation?.querySelector<HTMLElement>(".chat-composer");
      const composerActions = composer
        ? Array.from(
            composer.querySelectorAll<HTMLElement>(
              ".chat-composer-tools button, .chat-composer-routing button, .chat-composer-meta-toggle, .chat-composer-submit",
            ),
          )
            .filter((element) => {
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0
              );
            })
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                bottom: rect.bottom,
                height: rect.height,
                label: element.getAttribute("aria-label") ?? "composer action",
                left: rect.left,
                right: rect.right,
                top: rect.top,
                width: rect.width,
              };
            })
        : [];
      // The form's one-column auto rows must shrink-wrap their content, not
      // stretch the composer into the transcript's minmax(0,1fr) row. Derive
      // the required footer from its controls rather than a possibly stretched
      // footer box; include legitimate normal-flow optional rows separately.
      const normalFlowBox = (element: HTMLElement) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.position === "absolute" ||
          style.position === "fixed" ||
          rect.height === 0
        )
          return null;
        return {
          height: rect.height,
          margin:
            (Number.parseFloat(style.marginTop) || 0) +
            (Number.parseFloat(style.marginBottom) || 0),
        };
      };
      const intrinsicComposer = composer
        ? (() => {
            const rows = Array.from(composer.children).filter(
              (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                normalFlowBox(element) !== null,
            );
            const optionalRows = rows.filter(
              (element) =>
                !element.matches(".chat-composer-main, .chat-composer-footer"),
            );
            const optionalHeight = optionalRows.reduce((sum, element) => {
              const box = normalFlowBox(element);
              return sum + (box ? box.height + box.margin : 0);
            }, 0);
            const tools = composer.querySelector<HTMLElement>(
              ".chat-composer-tools",
            );
            const right = composer.querySelector<HTMLElement>(
              ".chat-composer-footer-right",
            );
            const toolsHeight = Math.max(
              0,
              ...Array.from(
                tools?.querySelectorAll<HTMLElement>("button") ?? [],
              ).map((element) => normalFlowBox(element)?.height ?? 0),
            );
            const rightRows = Array.from(right?.children ?? []).filter(
              (element): element is HTMLElement =>
                element instanceof HTMLElement &&
                normalFlowBox(element) !== null,
            );
            const status = rightRows.find((element) =>
              element.matches(".chat-composer-status"),
            );
            const controlRowHeight = Math.max(
              0,
              ...rightRows
                .filter((element) => element !== status)
                .map((element) => normalFlowBox(element)?.height ?? 0),
            );
            const statusHeight = status
              ? (normalFlowBox(status)?.height ?? 0)
              : 0;
            const constrained =
              (conversation?.getBoundingClientRect().width ?? 0) < 640;
            // chat/layout.ts: footer top pad1, two-band gap6, right-grid gap4;
            // form row gap4, border2, padding7+6 (or mobile5+4).
            const rightHeight = constrained
              ? controlRowHeight + (status ? statusHeight + 4 : 0)
              : Math.max(controlRowHeight, statusHeight);
            const footerHeight = constrained
              ? toolsHeight + rightHeight + 6 + 1
              : Math.max(toolsHeight, rightHeight) + 1;
            const inputHeight =
              composer
                .querySelector<HTMLElement>(".chat-composer-input")
                ?.getBoundingClientRect().height ?? 0;
            return {
              ceiling:
                inputHeight +
                footerHeight +
                optionalHeight +
                Math.max(0, rows.length - 1) * 4 +
                (viewport.width < 480 ? 5 + 4 : 7 + 6) +
                2,
              optionalRows: optionalRows.length,
            };
          })()
        : null;
      const rootStyle = getComputedStyle(document.documentElement);
      const sidebar = document.querySelector<HTMLElement>(".app-sidebar");
      const sidebarBox = readBox(".app-sidebar");
      const headerActions = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".chat-header-top-actions button, .chat-header-top-actions [role='button']",
        ),
      )
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            bottom: rect.bottom,
            label:
              element.getAttribute("aria-label") ??
              element.textContent?.trim() ??
              "chat action",
            left: rect.left,
            right: rect.right,
            top: rect.top,
          };
        });

      return {
        attach: conversation
          ? readBox('button[aria-label="Attach multiple files"]', conversation)
          : null,
        composer: conversation ? readBox(".chat-composer", conversation) : null,
        composerActions,
        intrinsicComposer,
        composerInput: conversation
          ? readBox(".chat-composer-input", conversation)
          : null,
        composerTools: conversation
          ? readBox(".chat-composer-tools", conversation)
          : null,
        conversation: view
          ? readBox(
              "[data-session-panel]:not([hidden]) .chat-conversation",
              view,
            )
          : null,
        documentOverflow:
          document.documentElement.scrollWidth - window.innerWidth,
        dragbar: readBox(".window-dragbar--chat"),
        headerActions,
        modelTrigger: conversation
          ? readBox(".composer-model-trigger", conversation)
          : null,
        platformDarwin: document
          .querySelector(".desktop-shell")
          ?.classList.contains("platform-darwin"),
        routing: conversation
          ? readBox(".chat-composer-routing", conversation)
          : null,
        submit: conversation
          ? readBox(".chat-composer-submit", conversation)
          : null,
        transcript: conversation
          ? readBox(".chat-messages", conversation)
          : null,
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
  expect(geometry.conversation, `${label} active conversation`).not.toBeNull();
  expect(geometry.composer, `${label} chat composer`).not.toBeNull();
  expect(geometry.composerInput, `${label} composer input`).not.toBeNull();
  expect(geometry.composerTools, `${label} composer tools`).not.toBeNull();
  expect(
    geometry.intrinsicComposer,
    `${label} intrinsic composer budget`,
  ).not.toBeNull();
  expect(geometry.transcript, `${label} mounted transcript`).not.toBeNull();
  expect(geometry.routing, `${label} composer routing`).not.toBeNull();
  expect(geometry.submit, `${label} send/stop action`).not.toBeNull();
  expect(geometry.modelTrigger, `${label} model selector`).not.toBeNull();

  const controlHeight = geometry.tokens.controlHeight;
  const spacing = geometry.tokens.space || 8;
  expect(controlHeight, `${label} control-height token`).toBe(
    mode.controlHeight,
  );
  // shell-layout.ts and chat-chrome-layout.test.ts declare one 40px wide
  // row, two bands below 1180px, and the native title inset below 480px.
  // Tailwind's max-[...] boundaries are strict, including exactly 1180px.
  const expectedDragbarHeight =
    viewport.width < 480
      ? 80 + spacing + (geometry.platformDarwin ? 36 : 0)
      : viewport.width < 1180
        ? controlHeight + 40 + spacing
        : 40;
  expect(
    geometry.dragbar?.height ?? 0,
    `${label} declared chat masthead bands`,
  ).toBeCloseTo(expectedDragbarHeight, 1);
  for (const action of geometry.headerActions) {
    expect(
      action.top,
      `${label} ${action.label} stays below the dragbar top`,
    ).toBeGreaterThanOrEqual((geometry.dragbar?.top ?? 0) - 1);
    expect(
      action.bottom,
      `${label} ${action.label} stays above the dragbar bottom`,
    ).toBeLessThanOrEqual((geometry.dragbar?.bottom ?? 0) + 1);
    expect(
      action.left,
      `${label} ${action.label} stays inside the dragbar left edge`,
    ).toBeGreaterThanOrEqual((geometry.dragbar?.left ?? 0) - 1);
    expect(
      action.right,
      `${label} ${action.label} stays inside the dragbar right edge`,
    ).toBeLessThanOrEqual((geometry.dragbar?.right ?? viewport.width) + 1);
  }
  for (let index = 0; index < geometry.headerActions.length; index += 1) {
    const action = geometry.headerActions[index];
    if (!action) continue;
    for (const sibling of geometry.headerActions.slice(index + 1)) {
      const overlapWidth =
        Math.min(action.right, sibling.right) -
        Math.max(action.left, sibling.left);
      const overlapHeight =
        Math.min(action.bottom, sibling.bottom) -
        Math.max(action.top, sibling.top);
      expect(
        overlapWidth > 1 && overlapHeight > 1,
        `${label} ${action.label} does not overlap ${sibling.label}`,
      ).toBeFalsy();
    }
  }
  // The composer responds to its conversation's inline-size container, not
  // the window. chat/layout.ts declares two 44px control bands below 640px;
  // composer-selectors/layout.ts declares a 30px selector in wider sessions.
  const conversationWidth = geometry.conversation?.width ?? 0;
  const constrainedSession = conversationWidth < 640;
  for (const [name, control] of [
    ["Attach", geometry.attach],
    ["Send/stop", geometry.submit],
    ["Model selector", geometry.modelTrigger],
  ] as const) {
    expect(control, `${label} mandatory ${name}`).not.toBeNull();
    expect(
      control?.width ?? 0,
      `${label} ${name} visible width`,
    ).toBeGreaterThan(0);
    expect(
      control?.height ?? 0,
      `${label} ${name} visible height`,
    ).toBeGreaterThan(0);
    if (constrainedSession) {
      expect(
        control?.width ?? 0,
        `${label} ${name} touch width`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        control?.height ?? 0,
        `${label} ${name} touch height`,
      ).toBeGreaterThanOrEqual(44);
    }
  }
  // The compiled pane query follows (and overrides) the legacy viewport
  // width rules. An unconstrained 640–720px conversation still uses 12px.
  const expectedComposerWidth = constrainedSession
    ? conversationWidth - 16
    : viewport.width < 720
      ? conversationWidth - 12
      : Math.min(conversationWidth - 24, 880);
  expect(
    geometry.composer?.width ?? 0,
    `${label} pane-local composer width`,
  ).toBeCloseTo(expectedComposerWidth, 1);
  expect(
    geometry.composer?.width ?? 0,
    `${label} composer remains usefully wide`,
  ).toBeGreaterThan(Math.min(320, (geometry.view?.clientWidth ?? 0) * 0.45));
  for (const edge of ["left", "top"] as const) {
    expect(
      geometry.composer?.[edge] ?? -1,
      `${label} composer ${edge}`,
    ).toBeGreaterThanOrEqual((geometry.conversation?.[edge] ?? 0) - 1);
  }
  for (const edge of ["right", "bottom"] as const) {
    expect(
      geometry.composer?.[edge] ?? Number.POSITIVE_INFINITY,
      `${label} composer ${edge}`,
    ).toBeLessThanOrEqual((geometry.conversation?.[edge] ?? 0) + 1);
  }
  expect(
    geometry.composer?.height ?? 0,
    `${label} composer retains input and controls`,
  ).toBeGreaterThanOrEqual(controlHeight * 2.5);
  expect(
    geometry.composer?.height ?? Number.POSITIVE_INFINITY,
    `${label} composer shrink-wraps input, controls and ${geometry.intrinsicComposer?.optionalRows ?? 0} optional rows`,
  ).toBeLessThanOrEqual((geometry.intrinsicComposer?.ceiling ?? 0) + 1);
  // This scrubbed fixture has no queued drafts/attachments/approval requests.
  // When the declared intrinsic content fits, the transcript must not collapse.
  if (
    (geometry.conversation?.height ?? 0) >
    (geometry.intrinsicComposer?.ceiling ?? 0) + 4
  ) {
    expect(
      geometry.transcript?.height ?? 0,
      `${label} transcript retains space`,
    ).toBeGreaterThan(0);
  }
  // Preserve bounded composition instead of the obsolete single-footer cap.
  // ChatComposer's input remains 40/46px minimum and 112/132/156px maximum;
  // both control bands must fit inside the actual pane, without hiding actions.
  const minimumInputHeight = viewport.width < 480 ? 40 : 46;
  const maximumInputHeight =
    viewport.width < 480 ? 112 : viewport.width < 720 ? 132 : 156;
  expect(
    geometry.composerInput?.height ?? 0,
    `${label} readable input minimum`,
  ).toBeGreaterThanOrEqual(minimumInputHeight);
  expect(
    geometry.composerInput?.height ?? Number.POSITIVE_INFINITY,
    `${label} bounded input maximum`,
  ).toBeLessThanOrEqual(maximumInputHeight);
  expect(
    geometry.composerActions.length,
    `${label} real composer actions`,
  ).toBeGreaterThan(0);
  for (const action of geometry.composerActions) {
    expect(action.left, `${label} ${action.label} left`).toBeGreaterThanOrEqual(
      (geometry.composer?.left ?? 0) - 1,
    );
    expect(action.right, `${label} ${action.label} right`).toBeLessThanOrEqual(
      (geometry.composer?.right ?? 0) + 1,
    );
    expect(action.top, `${label} ${action.label} top`).toBeGreaterThanOrEqual(
      (geometry.composer?.top ?? 0) - 1,
    );
    expect(
      action.bottom,
      `${label} ${action.label} bottom`,
    ).toBeLessThanOrEqual((geometry.composer?.bottom ?? 0) + 1);
    if (constrainedSession) {
      expect(
        action.height,
        `${label} ${action.label} touch height`,
      ).toBeGreaterThanOrEqual(44);
      expect(
        action.width,
        `${label} ${action.label} touch width`,
      ).toBeGreaterThanOrEqual(44);
    }
  }
  for (let index = 0; index < geometry.composerActions.length; index += 1) {
    const action = geometry.composerActions[index];
    if (!action) continue;
    for (const sibling of geometry.composerActions.slice(index + 1)) {
      const overlapWidth =
        Math.min(action.right, sibling.right) -
        Math.max(action.left, sibling.left);
      const overlapHeight =
        Math.min(action.bottom, sibling.bottom) -
        Math.max(action.top, sibling.top);
      expect(
        overlapWidth > 1 && overlapHeight > 1,
        `${label} ${action.label} does not overlap ${sibling.label}`,
      ).toBeFalsy();
    }
  }
  expect(
    geometry.modelTrigger?.height ?? 0,
    `${label} pane-local model selector height`,
  ).toBeCloseTo(constrainedSession ? 44 : 30, 1);
  expect(
    geometry.modelTrigger?.left ?? -1,
    `${label} model selector routing left`,
  ).toBeGreaterThanOrEqual((geometry.routing?.left ?? 0) - 1);
  expect(
    geometry.modelTrigger?.right ?? Number.POSITIVE_INFINITY,
    `${label} model selector routing right`,
  ).toBeLessThanOrEqual((geometry.routing?.right ?? 0) + 1);
  if (constrainedSession) {
    expect(
      geometry.composerTools?.bottom ?? Number.POSITIVE_INFINITY,
      `${label} tools precede routing band`,
    ).toBeLessThanOrEqual((geometry.routing?.top ?? 0) + 1);
    expect(
      geometry.composer?.height ?? 0,
      `${label} two touch bands and input remain present`,
    ).toBeGreaterThanOrEqual(minimumInputHeight + 44 * 2);
  } else {
    expect(
      geometry.modelTrigger?.width ?? Number.POSITIVE_INFINITY,
      `${label} wide model selector cap`,
    ).toBeLessThanOrEqual(Math.min(210, viewport.width * 0.3) + 1);
  }
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
    join(workspaceDir, "theme-sweep.ts"),
    "export const themeSweep = 'semantic surfaces';\n",
    "utf8",
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
    test.setTimeout(600_000);
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
          ...isolatedRuntimeEnvironment(join(activeProfileDir, "runtime")),
          DOOLITTLE_DESKTOP_CWD:
            generatedProfile?.workspaceDir ?? process.env.DOOLITTLE_DESKTOP_CWD,
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
        await navigateToRoute(page, route);
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

        const routePage = view.locator(".page").first();
        if ((await routePage.count()) > 0 && (await routePage.isVisible())) {
          const horizontalBounds = await Promise.all([
            view.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right };
            }),
            routePage.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right };
            }),
          ]);
          expect(
            Math.abs(horizontalBounds[1].left - horizontalBounds[0].left),
          ).toBeLessThanOrEqual(1);
          expect(
            Math.abs(horizontalBounds[1].right - horizontalBounds[0].right),
          ).toBeLessThanOrEqual(1);
        }

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
                      requestId: crypto.randomUUID(),
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
      await auditResponsiveRoutes(app, page);
      await auditThemeResponsiveness(app, page);
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
