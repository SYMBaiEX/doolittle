import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const repoRoot = process.cwd();
const desktopRoot = resolve(repoRoot, "apps/desktop");

const routes = [
  ["dashboard", "Home"],
  ["chat", "Chat"],
  ["code", "Code"],
  ["browser", "Browser & preview"],
  ["review", "Work"],
  ["orchestration", "Work"],
  ["media", "Media studio"],
  ["automations", "Automations"],
  ["sessions", "Sessions"],
  ["gateway", "Gateway inbox"],
  ["activity", "Activity"],
  ["analytics", "Analytics"],
  ["models", "Models"],
  ["connections", "Providers & accounts"],
  ["tools", "Tools"],
  ["skills", "Skills"],
  ["plugins", "Plugins"],
  ["memory", "Memory"],
  ["profiles", "Profiles"],
  ["logs", "Logs"],
  ["settings", "Settings"],
  ["keys", "Keys"],
  ["runtime", "Runtime"],
  ["compatibility", "Compatibility"],
  ["registry", "Registry"],
  ["operatorSetup", "Setup"],
  ["docs", "About"],
] as const;

const visualAuditRoutes = new Set([
  "automations",
  "dashboard",
  "media",
  "operatorSetup",
  "docs",
  "settings",
  "tools",
]);

test.describe("Doolittle desktop navigation", () => {
  test("boots the real Electron shell and renders every application route", async ({
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    expect(browserName).toBe("chromium");
    const profileDir = mkdtempSync(join(tmpdir(), "doolittle-e2e-desktop-"));
    const researchTaskTitle = `E2E SDK research receipt ${Date.now()}`;
    const alternateWorkspace = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-e2e-workspace-")),
    );
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({
        currentPath: repoRoot,
        recentPaths: [repoRoot, alternateWorkspace],
      })}\n`,
      "utf8",
    );
    const app = await electron.launch({
      args: [desktopRoot, `--user-data-dir=${profileDir}`],
      cwd: repoRoot,
      env: {
        ...process.env,
        DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
        DOOLITTLE_DESKTOP_CWD: repoRoot,
        DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
        ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
      },
    });

    try {
      const page = await app.firstWindow();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });
      await expect(page).toHaveTitle(/Doolittle$/);
      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 45_000 },
      );
      const shellBeforeCommandMenu = await page
        .locator(".desktop-shell")
        .boundingBox();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+K" : "Control+K",
      );
      const commandMenu = page.getByRole("dialog", { name: "Command menu" });
      await expect(commandMenu).toBeVisible();
      await commandMenu.evaluate(async (element) => {
        await Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        );
      });
      const commandMenuLayout = await commandMenu.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const overlay = element.previousElementSibling;
        return {
          centerX: bounds.left + bounds.width / 2,
          centerY: bounds.top + bounds.height / 2,
          position: window.getComputedStyle(element).position,
          overlayPosition:
            overlay instanceof HTMLElement
              ? window.getComputedStyle(overlay).position
              : null,
          viewportCenterX: window.innerWidth / 2,
          viewportCenterY: window.innerHeight / 2,
        };
      });
      expect(commandMenuLayout.position).toBe("fixed");
      expect(commandMenuLayout.overlayPosition).toBe("fixed");
      expect(
        Math.abs(commandMenuLayout.centerX - commandMenuLayout.viewportCenterX),
      ).toBeLessThan(2);
      expect(
        Math.abs(commandMenuLayout.centerY - commandMenuLayout.viewportCenterY),
      ).toBeLessThan(2);
      expect(await page.locator(".desktop-shell").boundingBox()).toEqual(
        shellBeforeCommandMenu,
      );
      await expect(commandMenu.getByText("Quick actions")).toBeVisible();
      expect(await commandMenu.getByRole("option").count()).toBeLessThanOrEqual(
        12,
      );
      await expect(
        commandMenu
          .locator(".command-palette__group")
          .filter({ hasText: "Quick actions" })
          .locator(".command-palette__item-label"),
      ).toHaveText([
        "New conversation",
        "Open terminal",
        "Choose repository",
        "Open live tasks",
      ]);
      const commandMenuScreenshot = testInfo.outputPath(
        "doolittle-command-menu.png",
      );
      await commandMenu.screenshot({
        animations: "disabled",
        path: commandMenuScreenshot,
      });
      await testInfo.attach("command menu", {
        contentType: "image/png",
        path: commandMenuScreenshot,
      });
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+K" : "Control+K",
      );
      await expect(commandMenu).toBeHidden();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+K" : "Control+K",
      );
      await expect(commandMenu).toBeVisible();
      await commandMenu
        .getByRole("combobox", { name: "Search" })
        .fill("terminal");
      await expect(
        commandMenu.getByRole("option", { name: /Open terminal/ }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(commandMenu).toBeHidden();
      const liveWorkspaceHandoff = await page.evaluate(
        async ({ alternateWorkspace, repoRoot }) => {
          const requestJson = async <T>(path: string): Promise<T> => {
            const response = await window.doolittle.requestAgent({
              path,
              method: "GET",
              headers: { accept: "application/json" },
            });
            if (response.status < 200 || response.status >= 300) {
              throw new Error(`Agent request failed with ${response.status}.`);
            }
            return JSON.parse(response.body) as T;
          };
          const beforeState = await window.doolittle.getBackendState();
          const beforeHealth = await requestJson<{
            processId: number;
            workspaceDir: string;
          }>("/health");
          await window.doolittle.switchWorkspace(alternateWorkspace);
          const alternateState = await window.doolittle.getBackendState();
          const alternateHealth = await requestJson<{
            processId: number;
            workspaceDir: string;
          }>("/health");
          await window.doolittle.switchWorkspace(repoRoot);
          const restoredState = await window.doolittle.getBackendState();
          const restoredHealth = await requestJson<{
            processId: number;
            workspaceDir: string;
          }>("/health");
          return {
            beforeState,
            beforeHealth,
            alternateState,
            alternateHealth,
            restoredState,
            restoredHealth,
          };
        },
        { alternateWorkspace, repoRoot },
      );
      expect(liveWorkspaceHandoff.beforeState.phase).toBe("ready");
      expect(liveWorkspaceHandoff.alternateState).toEqual(
        liveWorkspaceHandoff.beforeState,
      );
      expect(liveWorkspaceHandoff.restoredState).toEqual(
        liveWorkspaceHandoff.beforeState,
      );
      expect(liveWorkspaceHandoff.alternateHealth.processId).toBe(
        liveWorkspaceHandoff.beforeHealth.processId,
      );
      expect(liveWorkspaceHandoff.restoredHealth.processId).toBe(
        liveWorkspaceHandoff.beforeHealth.processId,
      );
      expect(liveWorkspaceHandoff.alternateHealth.workspaceDir).toBe(
        alternateWorkspace,
      );
      expect(liveWorkspaceHandoff.restoredHealth.workspaceDir).toBe(repoRoot);
      await expect(page.locator(".window-context strong")).toHaveText("Chat");
      await page.getByRole("button", { name: "Collapse navigation" }).click();
      await expect(page.locator(".desktop-shell")).toHaveClass(/nav-collapsed/);
      await page.getByRole("button", { name: "Expand navigation" }).click();
      await expect(page.locator(".desktop-shell")).not.toHaveClass(
        /nav-collapsed/,
      );

      const sidebarResizer = page.getByRole("separator", {
        name: "Resize project navigation",
      });
      await sidebarResizer.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem("doolittle.desktop.layout.sidebar-width.v1"),
          ),
        )
        .not.toBe("252");

      await page.getByRole("button", { name: "Manage projects" }).click();
      const projectManager = page.getByRole("dialog", { name: "Projects" });
      await expect(projectManager).toBeVisible();
      await page.getByRole("button", { name: "+ New" }).click();
      const projectEditor = page.getByRole("dialog", {
        name: "Create a project",
      });
      const projectName = projectEditor.getByRole("textbox", { name: "Name" });
      await projectName.fill("Discarded project draft");
      await page.keyboard.press("Escape");
      await expect(projectEditor).toBeHidden();
      await expect(projectManager).toBeVisible();
      await expect(page.getByRole("button", { name: "+ New" })).toBeFocused();
      await page.getByRole("button", { name: "+ New" }).click();
      await expect(
        page
          .getByRole("dialog", { name: "Create a project" })
          .getByRole("textbox", { name: "Name" }),
      ).toHaveValue("");
      await page.getByRole("textbox", { name: "Name" }).fill("E2E repository");
      await page.getByRole("button", { name: "Create project" }).click();
      await page.getByRole("button", { name: "Close projects" }).click();

      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      await expect(page.locator(".window-context strong")).toHaveText("Code");
      await page.locator(".project-rail-all").click();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/code");
      await page
        .locator(".project-rail-main")
        .filter({ hasText: "E2E repository" })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/code");
      await expect(page.locator(".view-code .coding-grid")).toBeVisible();
      const workspaceTree = page.getByRole("tree", {
        name: "Workspace files",
      });
      await expect(workspaceTree).toBeVisible();
      const appsFolder = workspaceTree.getByRole("treeitem", {
        name: "apps",
        exact: true,
      });
      await expect(appsFolder).toHaveAttribute("aria-expanded", "false");
      await expect(
        workspaceTree.getByRole("treeitem", {
          name: "desktop",
          exact: true,
        }),
      ).toHaveCount(0);
      await appsFolder.click();
      await expect(appsFolder).toHaveAttribute("aria-expanded", "true");
      await expect(
        workspaceTree.getByRole("treeitem", {
          name: "desktop",
          exact: true,
        }),
      ).toBeVisible();
      await appsFolder.click();
      await expect(appsFolder).toHaveAttribute("aria-expanded", "false");

      await workspaceTree.getByRole("treeitem", { name: /AGENTS\.md/ }).click();
      await expect(
        page.locator(".doolittle-code-editor .monaco-editor"),
      ).toBeVisible();
      await expect(page.locator(".coding-breadcrumb small")).toHaveText(
        "Markdown",
      );
      await expect(page.locator(".coding-acp-status")).toContainText(
        "ACP live",
      );
      await expect(
        page.locator(".interactive-terminal-launchpad"),
      ).toBeVisible();
      await expect(page.locator(".interactive-terminal-mode")).toHaveText(
        /(?:PTY|PIPE) · \d+×\d+/,
      );
      await expect(
        page.locator(".interactive-terminal-mode"),
      ).not.toContainText("100×30");
      const codeWorkspaceScreenshot = testInfo.outputPath(
        "doolittle-code-workspace.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: codeWorkspaceScreenshot,
      });
      await testInfo.attach("code workspace", {
        contentType: "image/png",
        path: codeWorkspaceScreenshot,
      });

      const explorerResizer = page.getByRole("separator", {
        name: "Resize code explorer",
      });
      await explorerResizer.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem("doolittle.desktop.code.explorer-width.v1"),
          ),
        )
        .not.toBe("280");

      const verifyAllRoutes = async () => {
        for (const [route, label] of routes) {
          await page.evaluate((nextRoute) => {
            window.location.hash = `#/${nextRoute}`;
          }, route);
          await expect(page.locator(".window-context strong")).toHaveText(
            label,
          );
          await expect(page.locator(".recovery-shell")).toHaveCount(0);
          const viewContainer = page.locator(
            `.view-container[data-view="${route}"]`,
          );
          await expect(viewContainer).toBeVisible();
          await expect
            .poll(() =>
              viewContainer.evaluate(
                (container) =>
                  container.scrollWidth <= container.clientWidth + 1,
              ),
            )
            .toBe(true);
          if (route === "operatorSetup") {
            await expect(viewContainer).not.toContainText("[object Object]");
            await expect(
              viewContainer.locator(".compact-stat-strip"),
            ).toBeVisible();
            await expect(viewContainer.locator(".two-column-grid")).toHaveCount(
              0,
            );
            await expect(
              viewContainer.getByText("Configuration guidance", {
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              viewContainer.locator(".setup-guidance"),
            ).not.toHaveAttribute("open");
          }
          if (route === "docs") {
            await expect(viewContainer).not.toContainText("Unnamed check");
            await expect(
              viewContainer.getByText("System checks", { exact: true }),
            ).toBeVisible();
            const architecture = viewContainer.locator(
              ".architecture-disclosure",
            );
            await expect(architecture).not.toHaveAttribute("open");
            await architecture.locator("summary").click();
            await expect(architecture).toHaveAttribute("open", "");
            await architecture.locator("summary").click();
            await expect(architecture).not.toHaveAttribute("open");
          }
          if (route === "dashboard") {
            const workspaceDetails = viewContainer.locator(
              ".dashboard-workspace-details",
            );
            await expect(workspaceDetails).not.toHaveAttribute("open");
            await workspaceDetails.locator("summary").click();
            await expect(workspaceDetails).toHaveAttribute("open", "");
            await workspaceDetails.locator("summary").click();
            await expect(workspaceDetails).not.toHaveAttribute("open");
          }
          if (route === "automations") {
            const createAutomation = viewContainer.getByRole("button", {
              name: "New automation",
            });
            await expect(createAutomation).toBeVisible();
            await createAutomation.click();
            await expect(
              viewContainer.getByRole("heading", {
                name: "When this happens, decide, then act",
              }),
            ).toBeVisible();
            await viewContainer
              .getByRole("button", { name: "Close builder" })
              .click();
            await expect(
              viewContainer.getByRole("heading", {
                name: "When this happens, decide, then act",
              }),
            ).toBeHidden();
          }
          if (route === "gateway") {
            const pairing = viewContainer.locator(".pairing-panel");
            await pairing.locator("summary").click();
            await expect(pairing).toHaveAttribute("open", "");
            await pairing.locator("summary").click();
            await expect(pairing).not.toHaveAttribute("open", "");
          }
          if (route === "models") {
            const diagnostics = viewContainer.locator(".model-diagnostic");
            await expect(diagnostics).toHaveCount(2);
            await expect(diagnostics.nth(0)).not.toHaveAttribute("open");
            await diagnostics.nth(0).locator("summary").click();
            await expect(diagnostics.nth(0)).toHaveAttribute("open", "");
            await diagnostics.nth(0).locator("summary").click();
            await expect(diagnostics.nth(0)).not.toHaveAttribute("open");
          }
          if (route === "logs") {
            const traces = viewContainer.locator(".operations-trace-details");
            await traces.locator("summary").click();
            await expect(traces).toHaveAttribute("open", "");
            await traces.locator("summary").click();
            await expect(traces).not.toHaveAttribute("open", "");
          }
          if (route === "settings") {
            await viewContainer
              .getByRole("button", { name: /Advanced/ })
              .click();
            const advancedGroups = viewContainer.locator(
              ".settings-field-disclosure",
            );
            await expect(advancedGroups.first()).toBeVisible();
            await expect(advancedGroups.first()).not.toHaveAttribute("open");
            await advancedGroups.first().locator("summary").click();
            await expect(advancedGroups.first()).toHaveAttribute("open", "");
            await advancedGroups.first().locator("summary").click();
            await expect(advancedGroups.first()).not.toHaveAttribute("open");
          }
          if (route === "sessions") {
            await expect(
              viewContainer
                .locator(".session-empty-landing")
                .getByText("No sessions yet", { exact: true }),
            ).toBeVisible();
            await expect(
              viewContainer.locator(".split-workspace.is-empty"),
            ).toBeVisible();
            await expect(viewContainer.locator(".list-panel")).toBeHidden();
            await expect(viewContainer.locator(".detail-panel")).toBeHidden();
          }
          if (route === "compatibility") {
            const rawReport = viewContainer.locator(".raw-data-disclosure");
            if ((await rawReport.count()) > 0) {
              await rawReport.locator("summary").click();
              await expect(rawReport).toHaveAttribute("open", "");
              await rawReport.locator("summary").click();
              await expect(rawReport).not.toHaveAttribute("open");
            }
          }
          const actionMotion = await viewContainer.evaluate((container) => {
            const visible = (element: Element) => {
              const bounds = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              return (
                bounds.width > 0 &&
                bounds.height > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden"
              );
            };
            const controls = Array.from(
              container.querySelectorAll<HTMLElement>(
                'button, a[href], summary, [role="button"], [role="tab"], input, select, textarea',
              ),
            ).filter(visible);
            const actions = controls.filter((element) =>
              element.matches(
                'button, a[href], summary, [role="button"], [role="tab"]',
              ),
            );
            const hasMotion = (element: HTMLElement) =>
              window
                .getComputedStyle(element)
                .transitionDuration.split(",")
                .some((duration) => Number.parseFloat(duration) > 0);
            const hasDirectManipulation = (element: HTMLElement) => {
              const touchAction = window.getComputedStyle(element).touchAction;
              return (
                touchAction === "manipulation" ||
                (touchAction.includes("pan-x") && touchAction.includes("pan-y"))
              );
            };
            const hasActionLabel = (element: HTMLElement) =>
              Boolean(
                element.textContent?.trim() ||
                  element.getAttribute("aria-label")?.trim() ||
                  element.getAttribute("aria-labelledby")?.trim() ||
                  element.getAttribute("title")?.trim(),
              );
            return {
              controlsHaveMotion: controls.every(hasMotion),
              directManipulationFailures: actions
                .filter((element) => !hasDirectManipulation(element))
                .map((element) => {
                  const touchAction =
                    window.getComputedStyle(element).touchAction;
                  return `${element.tagName.toLowerCase()}.${element.className}:${touchAction}`;
                }),
              unlabeledActionFailures: actions
                .filter((element) => !hasActionLabel(element))
                .map(
                  (element) =>
                    `${element.tagName.toLowerCase()}.${element.className}`,
                ),
            };
          });
          expect(actionMotion).toEqual({
            controlsHaveMotion: true,
            directManipulationFailures: [],
            unlabeledActionFailures: [],
          });
          if (visualAuditRoutes.has(route)) {
            await expect(viewContainer.locator(".loading-block")).toHaveCount(
              0,
              {
                timeout: 30_000,
              },
            );
            const routeScreenshot = testInfo.outputPath(
              `doolittle-${route}-route.png`,
            );
            await page.screenshot({
              animations: "disabled",
              path: routeScreenshot,
            });
            await testInfo.attach(`${route} route`, {
              contentType: "image/png",
              path: routeScreenshot,
            });
          }
        }
      };

      await page.setViewportSize({ width: 1600, height: 1000 });
      await page.evaluate(() => {
        window.location.hash = "#/connections";
      });
      const providersHeading = page.getByRole("heading", {
        name: "Providers & accounts",
      });
      const recoveryShell = page.locator(".recovery-shell");
      await Promise.race([
        providersHeading.waitFor({ state: "visible" }),
        recoveryShell.waitFor({ state: "visible" }),
      ]);
      if (await recoveryShell.isVisible()) {
        const detail = await recoveryShell
          .locator(".recovery-details pre")
          .textContent();
        throw new Error(
          `Connections route renderer recovery: ${detail}\n${pageErrors.join("\n")}`,
        );
      }
      await expect(providersHeading).toBeVisible();
      await expect(
        page.getByText(
          "Route chats, connect provider subscriptions, and shape how spawned agents move across pooled accounts.",
          { exact: true },
        ),
      ).toBeVisible();
      const providerHeaderLayout = await page
        .locator(".page-header")
        .evaluate((element) => {
          const headerRect = element.getBoundingClientRect();
          const content = element.firstElementChild;
          const action = element.querySelector(".page-actions");
          const contentRect = content?.getBoundingClientRect();
          const actionRect = action?.getBoundingClientRect();
          return {
            actionRightGap: actionRect
              ? Math.round(headerRect.right - actionRect.right)
              : null,
            contentWidth: contentRect ? Math.round(contentRect.width) : null,
            headerWidth: Math.round(headerRect.width),
          };
        });
      expect(providerHeaderLayout.actionRightGap).toBeLessThanOrEqual(4);
      expect(providerHeaderLayout.contentWidth).toBe(
        providerHeaderLayout.headerWidth,
      );
      const poolDisclosure = page.locator(
        ".provider-routing-disclosure > summary",
      );
      await expect(poolDisclosure).toContainText("Subscription account pools", {
        timeout: 30_000,
      });
      await poolDisclosure.click();
      await expect(
        page.getByRole("region", {
          name: "Codex spawned-agent account pool",
        }),
      ).toContainText("Accounts", { timeout: 30_000 });
      await expect(
        page.getByRole("region", {
          name: "Claude Code spawned-agent account pool",
        }),
      ).toContainText("Accounts", { timeout: 30_000 });
      await expect(
        page.locator(".provider-pool-header-actions .badge"),
      ).toHaveCount(2, {
        timeout: 30_000,
      });
      await expect(page.locator(".provider-pool-directory")).toHaveCount(2);
      await expect(page.locator("body")).not.toContainText(/access[_-]?token/i);
      await expect(page.locator("body")).not.toContainText(
        /refresh[_-]?token/i,
      );
      const codexPool = page.getByRole("region", {
        name: "Codex spawned-agent account pool",
      });
      await codexPool.getByRole("button", { name: "Manage" }).click();
      const routingStrategy = codexPool.getByRole("combobox", {
        name: "Strategy",
      });
      await expect(routingStrategy).toContainText("Priority");
      const strategyGeometry = await routingStrategy.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          display: style.display,
          height: Math.round(rect.height),
          width: Math.round(rect.width),
        };
      });
      expect(strategyGeometry).toEqual({
        display: "flex",
        height: 32,
        width: 160,
      });
      await expect(
        routingStrategy.getByText("Always prefer the top healthy account."),
      ).toBeHidden();
      await expect(page.locator(".provider-import-disclosure")).toHaveCount(2);
      await expect(
        page.getByText("Checking the default chat provider…"),
      ).toHaveCount(0, { timeout: 30_000 });
      await expect(page.locator(".provider-overview")).toContainText(
        "Current route",
      );
      await expect(page.locator(".provider-connection-row")).toHaveCount(4);
      await expect(page.locator(".provider-pool-panel")).toHaveCount(2);
      await expect(page.locator(".provider-pool-toolbar")).toHaveCount(2);
      const providerPoolColumns = await page
        .locator(".provider-pool-stack")
        .evaluate(
          (element) =>
            getComputedStyle(element).gridTemplateColumns.split(" ").length,
        );
      expect(providerPoolColumns).toBe(2);
      await expect(page.locator(".provider-pool-journey")).toHaveCount(0);
      await expect(
        page.locator(".view-connections .provider-card"),
      ).toHaveCount(0);
      await providersHeading.scrollIntoViewIfNeeded();
      const providersScreenshot = testInfo.outputPath(
        "doolittle-providers-and-accounts.png",
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: providersScreenshot,
      });
      await testInfo.attach("providers and accounts", {
        contentType: "image/png",
        path: providersScreenshot,
      });
      const providerPoolScreenshot = testInfo.outputPath(
        "doolittle-provider-account-pool.png",
      );
      await codexPool.screenshot({
        animations: "disabled",
        path: providerPoolScreenshot,
      });
      await testInfo.attach("provider account pool", {
        contentType: "image/png",
        path: providerPoolScreenshot,
      });
      const accountDisclosure = codexPool.locator(
        ".provider-import-disclosure > summary",
      );
      await expect(
        codexPool.getByRole("textbox", { name: "Account ID" }),
      ).toBeHidden();
      await accountDisclosure.click();
      await expect(
        codexPool.getByRole("textbox", { name: "Account ID" }),
      ).toBeVisible();
      await routingStrategy.click();
      await expect(page.getByRole("option")).toHaveCount(4);
      await page.keyboard.press("Escape");

      await page.evaluate(() => {
        window.location.hash = "#/dashboard";
      });
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      const connectionsRevisit = await page.evaluate(
        () =>
          new Promise<{ elapsedMs: number; sawLoadingState: boolean }>(
            (resolve, reject) => {
              const started = performance.now();
              let sawLoadingState = false;
              let timeout = 0;
              const inspect = () => {
                sawLoadingState ||= Boolean(
                  document.querySelector(".view-connections .loading-block"),
                );
                if (
                  document.querySelectorAll(
                    ".view-connections .provider-connection-row",
                  ).length === 4
                ) {
                  window.clearTimeout(timeout);
                  observer.disconnect();
                  resolve({
                    elapsedMs: performance.now() - started,
                    sawLoadingState,
                  });
                }
              };
              const observer = new MutationObserver(inspect);
              observer.observe(document.body, {
                childList: true,
                subtree: true,
              });
              timeout = window.setTimeout(() => {
                observer.disconnect();
                reject(new Error("Connections revisit did not render"));
              }, 5_000);
              window.location.hash = "#/connections";
              inspect();
            },
          ),
      );
      expect(connectionsRevisit.sawLoadingState).toBe(false);
      expect(connectionsRevisit.elapsedMs).toBeLessThan(750);

      if (
        !(await page
          .locator(".provider-routing-disclosure")
          .evaluate((element) => element.hasAttribute("open")))
      ) {
        await poolDisclosure.click();
      }
      await expect(codexPool).toBeVisible();
      const manageCodexPool = codexPool.getByRole("button", {
        name: /Manage|Done/,
      });
      await expect(manageCodexPool).toBeVisible();
      if ((await manageCodexPool.textContent())?.trim() === "Manage") {
        await manageCodexPool.click();
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        codexPool.getByRole("button", { name: "Preview" }),
      ).toBeVisible();
      const narrowProviderLayout = await page.evaluate(() => {
        const pool = document.querySelector(
          '[aria-label="Codex spawned-agent account pool"]',
        );
        const preview = [...document.querySelectorAll("button")].find(
          (button) => button.textContent?.trim() === "Preview",
        );
        const poolRect = pool?.getBoundingClientRect();
        const previewRect = preview?.getBoundingClientRect();
        return {
          documentFits:
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
          poolFits:
            Boolean(poolRect) &&
            (poolRect?.left ?? -1) >= 0 &&
            (poolRect?.right ?? Number.POSITIVE_INFINITY) <= window.innerWidth,
          previewFits:
            Boolean(previewRect) &&
            (previewRect?.left ?? -1) >= 0 &&
            (previewRect?.right ?? Number.POSITIVE_INFINITY) <=
              window.innerWidth,
        };
      });
      expect(narrowProviderLayout).toEqual({
        documentFits: true,
        poolFits: true,
        previewFits: true,
      });
      await providersHeading.scrollIntoViewIfNeeded();
      const narrowProvidersScreenshot = testInfo.outputPath(
        "doolittle-providers-and-accounts-narrow.png",
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: narrowProvidersScreenshot,
      });
      await testInfo.attach("providers and accounts narrow", {
        contentType: "image/png",
        path: narrowProvidersScreenshot,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.evaluate(() => {
        window.location.hash = "#/orchestration";
      });
      await expect(
        page.getByRole("heading", { name: "Agent work" }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: /Build & research/ }),
      ).toBeVisible();
      await page.getByRole("tab", { name: /Build & research/ }).click();
      await expect(
        page.getByText("New workflow", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Workflows", { exact: true })).toBeVisible();
      await expect(page.getByText("Runs", { exact: true })).toBeVisible();
      const queueTab = page.getByRole("tab", { name: /^Queue/ });
      await queueTab.click();
      await expect(queueTab).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "New research task" }).click();
      const taskForm = page.locator("form.orchestration-quick-create");
      await expect(taskForm.getByLabel("Task work type")).toHaveValue(
        "research",
      );
      await taskForm.getByLabel("Task framework").selectOption("codex");
      await taskForm.getByLabel("Title").fill(researchTaskTitle);
      await taskForm
        .getByLabel("Objective")
        .fill("Research the Eliza account-pool orchestration path.");
      await taskForm
        .getByRole("button", { name: "Create research task" })
        .click();
      await expect(page.getByText("Task created.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page
          .locator(".orchestration-master-item")
          .filter({ hasText: researchTaskTitle }),
      ).toBeVisible({ timeout: 30_000 });
      const researchReceipt = await page.evaluate(async (taskTitle) => {
        const response = await window.doolittle.requestAgent({
          path: "/delegation/tasks?limit=100",
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Agent request failed with ${response.status}.`);
        }
        const result = JSON.parse(response.body) as {
          tasks?: Array<{
            title?: string;
            capabilityProfile?: string;
            kind?: string;
            framework?: string;
            workspaceRoot?: string;
          }>;
        };
        return result.tasks?.find((task) => task.title === taskTitle);
      }, researchTaskTitle);
      expect(researchReceipt).toMatchObject({
        capabilityProfile: "research",
        kind: "research",
        framework: "codex",
        workspaceRoot: repoRoot,
      });
      const taskDetail = page.locator(".orchestration-detail");
      await expect(taskDetail).toContainText("Capability");
      await expect(taskDetail).toContainText("research");
      await expect(taskDetail).toContainText("codex");
      await expect(taskDetail).toContainText("automatic account routing");
      const researchTaskScreenshot = testInfo.outputPath(
        "doolittle-research-task-receipt.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: researchTaskScreenshot,
      });
      await testInfo.attach("research task receipt", {
        contentType: "image/png",
        path: researchTaskScreenshot,
      });

      await verifyAllRoutes();

      await page.evaluate(() => {
        window.location.hash = "#/runtime";
      });
      const runtimeTabs = page.getByRole("tablist", {
        name: "Runtime sections",
      });
      await runtimeTabs.getByRole("tab", { name: /Gateway/ }).click();
      await expect(
        runtimeTabs.getByRole("tab", { name: /Gateway/ }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("heading", { name: "Transport control" }),
      ).toBeVisible();
      await runtimeTabs.getByRole("tab", { name: /Inventory/ }).click();
      await expect(
        page.getByRole("heading", { name: "Capability catalog" }),
      ).toBeVisible();
      await runtimeTabs.getByRole("tab", { name: /Overview/ }).click();
      await expect(
        page.getByRole("heading", { name: "Account routing" }),
      ).toBeVisible();

      await page.evaluate(() => {
        window.location.hash = "#/memory";
      });
      const memoryTabs = page.getByRole("tablist", {
        name: "Memory workspaces",
      });
      await memoryTabs.getByRole("tab", { name: "Profiles & recall" }).click();
      await expect(
        memoryTabs.getByRole("tab", { name: "Profiles & recall" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("heading", { name: "Profile search" }),
      ).toBeVisible();
      await memoryTabs.getByRole("tab", { name: "Shared memory" }).click();
      await expect(
        memoryTabs.getByRole("tab", { name: "Shared memory" }),
      ).toHaveAttribute("aria-selected", "true");

      await page.evaluate(() => {
        window.location.hash = "#/skills";
      });
      await page.getByRole("tab", { name: /Workshop/ }).click();
      await expect(
        page.getByRole("heading", { name: "Review before activation" }),
      ).toBeVisible();

      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      const terminalTabs = page.getByRole("tablist", {
        name: "Interactive terminal tabs",
      });
      const addTerminal = page.getByRole("button", {
        name: "Create terminal tab",
      });
      for (const expectedCount of [2, 3, 4]) {
        await addTerminal.click();
        await expect(terminalTabs.getByRole("tab")).toHaveCount(expectedCount);
      }
      await expect(terminalTabs.getByRole("tab")).toHaveCount(4);
      await expect(addTerminal).toBeDisabled();

      await page.evaluate(() => {
        window.location.hash = "#/review";
      });
      await page.getByRole("tab", { name: "Review" }).click();
      await expect(
        page.locator('section[aria-label="Current agent work outcome"]'),
      ).toBeVisible();
      await page.locator(".project-rail-all").click();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/review");
      await expect(page.locator(".review-page")).toHaveAttribute(
        "data-project-scope",
        "all",
      );
      await page
        .locator(".project-rail-main")
        .filter({ hasText: "E2E repository" })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/review");
      await expect(page.locator(".review-page")).toHaveAttribute(
        "data-project-scope",
        /^[0-9a-f-]{36}$/,
      );
      await page.setViewportSize({ width: 390, height: 844 });
      const narrowReviewLayout = await page.evaluate(() => {
        const workspace = document.querySelector(".review-workspace");
        const rail = document.querySelector(".review-rail");
        const detail = document.querySelector(".review-detail");
        const tab = document.querySelector<HTMLButtonElement>(
          ".review-tabs button",
        );
        const workspaceRect = workspace?.getBoundingClientRect();
        const railRect = rail?.getBoundingClientRect();
        const detailRect = detail?.getBoundingClientRect();
        const tabRect = tab?.getBoundingClientRect();
        return {
          documentFits:
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
          detailBelowRail:
            Boolean(railRect && detailRect) &&
            (detailRect?.top ?? 0) >=
              (railRect?.bottom ?? Number.POSITIVE_INFINITY),
          tabFits:
            Boolean(tabRect) &&
            (tabRect?.left ?? -1) >= 0 &&
            (tabRect?.right ?? Number.POSITIVE_INFINITY) <= window.innerWidth,
          workspaceFits:
            Boolean(workspaceRect) &&
            (workspaceRect?.left ?? -1) >= 0 &&
            (workspaceRect?.right ?? Number.POSITIVE_INFINITY) <=
              window.innerWidth,
        };
      });
      expect(narrowReviewLayout).toEqual({
        detailBelowRail: true,
        documentFits: true,
        tabFits: true,
        workspaceFits: true,
      });
      const narrowReviewScreenshot = testInfo.outputPath(
        "doolittle-review-narrow.png",
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: narrowReviewScreenshot,
      });
      await testInfo.attach("review narrow", {
        contentType: "image/png",
        path: narrowReviewScreenshot,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.evaluate(() => {
        window.location.hash = "#/gateway";
      });
      await expect(
        page.getByRole("heading", { name: "Gateway inbox" }),
      ).toBeVisible();

      await page.evaluate(() => {
        window.location.hash = "#/memory";
      });
      await expect(
        page.getByRole("heading", { name: "Memory", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: "Shared memory" }),
      ).toHaveAttribute("aria-selected", "true");

      await page.evaluate(() => {
        window.location.hash = "#/tools";
      });
      const integrationDisclosure = page.locator(
        ".tools-integrations > summary",
      );
      await expect(integrationDisclosure).toContainText("Integration bridges");
      await integrationDisclosure.click();
      await expect(
        page.getByRole("heading", { name: "ACP bridge" }),
      ).toBeVisible();
      await expect(page.locator(".acp-bridge-summary")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(".acp-bridge-summary")).toContainText(
        "Registered tools",
      );
      const mcpMarketplace = page.locator(".mcp-control-marketplace");
      const mcpToolBrowser = page.locator(".mcp-control-browser");
      await expect(mcpMarketplace).not.toHaveAttribute("open");
      await expect(mcpToolBrowser).not.toHaveAttribute("open");
      await mcpMarketplace.locator("summary").click();
      await expect(mcpMarketplace).toHaveAttribute("open", "");
      await mcpMarketplace.locator("summary").click();
      await expect(mcpMarketplace).not.toHaveAttribute("open");
      await mcpToolBrowser.locator("summary").click();
      await expect(mcpToolBrowser).toHaveAttribute("open", "");
      await page
        .getByRole("textbox", { name: "Search ACP bridge tools" })
        .fill("workspace");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(
        page
          .locator(".acp-bridge-tool-list")
          .getByText("DOOLITTLE_WORKSPACE", { exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await expect(page.locator(".chat-sessions")).toHaveCount(0);
      await expect(page.locator(".window-status-strip")).toHaveCount(0);
      await expect(page.locator(".chat-status-runtime")).toContainText("Ready");
      const historyScrollport = await page
        .locator(".sidebar-projects__list")
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            flexGrow: style.flexGrow,
            overflowY: style.overflowY,
            overscrollBehaviorY: style.overscrollBehaviorY,
          };
        });
      expect(historyScrollport).toMatchObject({
        flexGrow: "1",
        overflowY: "auto",
        overscrollBehaviorY: "contain",
      });
      await expect(
        page.getByRole("button", { name: /^All conversations/ }),
      ).toBeVisible();

      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      const restingComposerStyle = await composer.evaluate((element) => {
        element.blur();
        const container = element.closest(".chat-composer");
        if (!(container instanceof HTMLElement)) {
          throw new Error("Chat composer container is missing.");
        }
        const textareaStyle = window.getComputedStyle(element);
        const containerStyle = window.getComputedStyle(container);
        return {
          borderColor: containerStyle.borderColor,
          boxShadow: containerStyle.boxShadow,
          textareaBoxShadow: textareaStyle.boxShadow,
          textareaOutline: textareaStyle.outlineStyle,
          textareaFocusVisible: element.matches(":focus-visible"),
        };
      });
      await composer.focus();
      const focusedComposerStyle = await composer.evaluate((element) => {
        const container = element.closest(".chat-composer");
        if (!(container instanceof HTMLElement)) {
          throw new Error("Chat composer container is missing.");
        }
        const textareaStyle = window.getComputedStyle(element);
        const containerStyle = window.getComputedStyle(container);
        return {
          borderColor: containerStyle.borderColor,
          boxShadow: containerStyle.boxShadow,
          textareaBoxShadow: textareaStyle.boxShadow,
          textareaOutline: textareaStyle.outlineStyle,
          textareaFocusVisible: element.matches(":focus-visible"),
        };
      });
      expect(restingComposerStyle.textareaFocusVisible).toBe(false);
      expect(focusedComposerStyle.textareaFocusVisible).toBe(true);
      expect(focusedComposerStyle.borderColor).not.toBe(
        restingComposerStyle.borderColor,
      );
      expect(focusedComposerStyle.boxShadow).not.toBe(
        restingComposerStyle.boxShadow,
      );
      expect(focusedComposerStyle.textareaBoxShadow).toBe("none");
      expect(focusedComposerStyle.textareaOutline).toBe("none");
      await composer.fill("Draft survives project switching");
      await page
        .getByRole("button", {
          name: /Choose project\. Current project E2E repository\./,
        })
        .click();
      await expect(
        page.getByRole("dialog", {
          name: "Choose a project for this new conversation",
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Add repository/ }),
      ).toBeVisible();
      const projectSelectorScreenshot = testInfo.outputPath(
        "doolittle-composer-project-selector.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: projectSelectorScreenshot,
      });
      await testInfo.attach("composer project selector", {
        contentType: "image/png",
        path: projectSelectorScreenshot,
      });
      await page
        .getByRole("dialog", {
          name: "Choose a project for this new conversation",
        })
        .getByRole("button", { name: /General/ })
        .click();
      await expect(composer).toHaveValue("Draft survives project switching");
      await page
        .getByRole("button", {
          name: /Choose project\. Current project General\./,
        })
        .click();
      await page
        .getByRole("dialog", {
          name: "Choose a project for this new conversation",
        })
        .getByRole("button", { name: /E2E repository/ })
        .click();
      await expect(composer).toHaveValue("Draft survives project switching");
      await composer.fill("");

      await page
        .getByRole("button", { name: /Choose model\. Current route/ })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Choose provider and model" }),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Search models" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Providers & accounts" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Refresh models/ }),
      ).toBeVisible();
      const modelSelectorScreenshot = testInfo.outputPath(
        "doolittle-composer-model-selector.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: modelSelectorScreenshot,
      });
      await testInfo.attach("composer model selector", {
        contentType: "image/png",
        path: modelSelectorScreenshot,
      });
      await page.keyboard.press("Escape");

      await composer.fill("/");
      await expect(
        page.getByRole("listbox", { name: "Chat commands" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await composer.fill("");
      const chatShellScreenshot = testInfo.outputPath(
        "doolittle-chat-shell.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: chatShellScreenshot,
      });
      await testInfo.attach("conversation-first shell", {
        contentType: "image/png",
        path: chatShellScreenshot,
      });

      await page.getByRole("button", { name: "Workbench" }).click();
      const workbench = page.locator("#thread-workbench");
      const workbenchTree = workbench.getByRole("tree", {
        name: "Workspace files",
      });
      const workbenchLoadError = workbench.getByRole("alert");
      await Promise.race([
        workbenchTree.waitFor({ state: "visible", timeout: 30_000 }),
        workbenchLoadError.waitFor({ state: "visible", timeout: 30_000 }),
      ]);
      if (await workbenchLoadError.isVisible()) {
        await workbenchLoadError
          .getByRole("button", { name: "Try again" })
          .click();
      }
      await expect(workbenchTree).toBeVisible({ timeout: 30_000 });
      const workbenchAppsFolder = workbenchTree.getByRole("treeitem", {
        name: "apps",
        exact: true,
      });
      await expect(workbenchAppsFolder).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await workbenchTree.getByRole("treeitem", { name: /AGENTS\.md/ }).click();
      await expect(
        page.locator(
          "#thread-workbench .thread-workbench-monaco .monaco-editor",
        ),
      ).toBeVisible();
      await expect(
        page.locator("#thread-workbench .thread-workbench-code-preview"),
      ).toContainText("Markdown");
      const workbenchEdges = await page.evaluate(() => {
        const wrapper = document
          .querySelector("#thread-workbench")
          ?.getBoundingClientRect();
        const panel = document
          .querySelector(".thread-workbench")
          ?.getBoundingClientRect();
        return wrapper && panel
          ? {
              wrapperRight: wrapper.right,
              panelRight: panel.right,
            }
          : null;
      });
      expect(workbenchEdges).not.toBeNull();
      expect(
        Math.abs(
          (workbenchEdges?.wrapperRight ?? 0) -
            (workbenchEdges?.panelRight ?? 0),
        ),
      ).toBeLessThan(2);
      await page.setViewportSize({ width: 390, height: 844 });
      const narrowWorkbenchDialog = page.getByRole("dialog", {
        name: "Thread workbench",
      });
      await expect(narrowWorkbenchDialog).toHaveAttribute("aria-modal", "true");
      await expect(page.locator(".chat-conversation")).toHaveAttribute(
        "inert",
        "",
      );
      await expect(
        narrowWorkbenchDialog.getByRole("button", {
          name: "Close thread workbench",
        }),
      ).toBeFocused();
      const narrowWorkbenchLayout = await page.evaluate(() => {
        const wrapper = document
          .querySelector("#thread-workbench")
          ?.getBoundingClientRect();
        const panel = document
          .querySelector(".thread-workbench")
          ?.getBoundingClientRect();
        const close = document
          .querySelector('[aria-label="Close thread workbench"]')
          ?.getBoundingClientRect();
        return {
          documentFits:
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
          panelMatchesWrapper:
            Boolean(wrapper && panel) &&
            Math.abs((wrapper?.left ?? 0) - (panel?.left ?? 0)) < 2 &&
            Math.abs((wrapper?.right ?? 0) - (panel?.right ?? 0)) < 2,
          closeFits:
            Boolean(close) &&
            (close?.left ?? -1) >= 0 &&
            (close?.right ?? Number.POSITIVE_INFINITY) <= window.innerWidth,
        };
      });
      expect(narrowWorkbenchLayout).toEqual({
        closeFits: true,
        documentFits: true,
        panelMatchesWrapper: true,
      });
      const narrowWorkbenchScreenshot = testInfo.outputPath(
        "doolittle-thread-workbench-narrow.png",
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: narrowWorkbenchScreenshot,
      });
      await testInfo.attach("thread workbench narrow", {
        contentType: "image/png",
        path: narrowWorkbenchScreenshot,
      });
      await narrowWorkbenchDialog
        .getByRole("button", { name: "Close thread workbench" })
        .click();
      await expect(
        page.getByRole("button", { name: "Workbench" }),
      ).toBeFocused();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.getByRole("button", { name: "Workbench" }).click();
      await expect(workbenchTree).toBeVisible();
      const workbenchScreenshot = testInfo.outputPath(
        "doolittle-thread-workbench.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: workbenchScreenshot,
      });
      await testInfo.attach("thread workbench", {
        contentType: "image/png",
        path: workbenchScreenshot,
      });
      await page.getByRole("tab", { name: /Brief/ }).click();
      await expect(
        page.getByRole("heading", { name: "Workspace pulse" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Close thread workbench" })
        .click();

      await page
        .getByRole("button", { name: "Open tools and settings" })
        .click();
      await expect(
        page.getByRole("complementary", { name: "Tools and settings" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Tools & settings" }),
      ).toBeVisible();
      const toolSearch = page.getByRole("searchbox", {
        name: "Find a tool or setting",
      });
      await expect(toolSearch).toBeVisible();
      await toolSearch.fill("compatibility");
      await expect(
        page.getByRole("button", { name: /Compatibility/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Media studio/ }),
      ).toHaveCount(0);
      await toolSearch.fill("");
      const toolsResizer = page.getByRole("separator", {
        name: "Resize tools and settings panel",
      });
      await toolsResizer.focus();
      await page.keyboard.press("ArrowLeft");
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem(
              "doolittle.desktop.layout.utility-drawer-width.v1",
            ),
          ),
        )
        .not.toBe("520");
      const toolsDrawerScreenshot = testInfo.outputPath(
        "doolittle-tools-drawer.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: toolsDrawerScreenshot,
      });
      await testInfo.attach("tools drawer", {
        contentType: "image/png",
        path: toolsDrawerScreenshot,
      });
      await page
        .getByRole("button", { name: "Close tools and settings" })
        .last()
        .click();

      await page.getByRole("button", { name: "Open command palette" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await app.close();
      rmSync(profileDir, { force: true, recursive: true });
      rmSync(alternateWorkspace, { force: true, recursive: true });
    }
  });
});
