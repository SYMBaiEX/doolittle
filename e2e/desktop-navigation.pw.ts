import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  type Locator,
  test,
} from "@playwright/test";
import { expectNoDesktopRecovery } from "./support/desktop-assertions";
import { isolatedRuntimeEnvironment } from "./support/isolated-runtime-environment";

const repoRoot = process.cwd();
const desktopRoot = resolve(repoRoot, "apps/desktop");

const routes = [
  ["dashboard", "Home"],
  ["chat", "Conversation"],
  ["code", "Workspace"],
  ["browser", "Preview & evidence"],
  ["review", "Review"],
  ["orchestration", "Runs"],
  ["media", "Assets"],
  ["automations", "Automations"],
  ["sessions", "History"],
  ["gateway", "Inbox"],
  ["activity", "Activity"],
  ["analytics", "Insights"],
  ["models", "Models"],
  ["connections", "Providers & accounts"],
  ["tools", "Tools"],
  ["skills", "Skills"],
  ["plugins", "Plugins"],
  ["memory", "Memory"],
  ["profiles", "Profiles"],
  ["logs", "Logs"],
  ["settings", "Settings"],
  ["keys", "Credentials"],
  ["runtime", "Runtime"],
  ["compatibility", "Compatibility"],
  ["registry", "Registry"],
  ["operatorSetup", "Setup"],
  ["docs", "About"],
] as const;

const visualAuditRoutes = new Set(routes.map(([route]) => route));

async function expectEditorToolbarGeometry(toolbar: Locator): Promise<void> {
  const geometry = await toolbar.evaluate((element) => {
    const rect = (target: Element) => {
      const { left, right, top, bottom, width, height } =
        target.getBoundingClientRect();
      return { left, right, top, bottom, width, height };
    };
    return {
      toolbar: rect(element),
      parts: [
        ...element.querySelectorAll(
          ".coding-tabs button, .coding-breadcrumb small, .coding-editor-actions button",
        ),
      ]
        .filter((part) => {
          const bounds = part.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0;
        })
        .map((part) => ({
          label: part.textContent?.trim() ?? "",
          ...rect(part),
        })),
    };
  });
  expect(geometry.parts.map((part) => part.label)).toEqual(
    expect.arrayContaining(["Markdown", "Discard", "Save"]),
  );
  for (const [index, part] of geometry.parts.entries()) {
    expect(
      part.left,
      `${part.label} stays inside the editor toolbar`,
    ).toBeGreaterThanOrEqual(geometry.toolbar.left - 1);
    expect(
      part.right,
      `${part.label} stays inside the editor toolbar`,
    ).toBeLessThanOrEqual(geometry.toolbar.right + 1);
    expect(part.top).toBeGreaterThanOrEqual(geometry.toolbar.top - 1);
    expect(part.bottom).toBeLessThanOrEqual(geometry.toolbar.bottom + 1);
    for (const other of geometry.parts.slice(index + 1)) {
      const overlapWidth =
        Math.min(part.right, other.right) - Math.max(part.left, other.left);
      const overlapHeight =
        Math.min(part.bottom, other.bottom) - Math.max(part.top, other.top);
      expect(
        overlapWidth <= 1 || overlapHeight <= 1,
        `${part.label} overlaps ${other.label}`,
      ).toBe(true);
    }
  }
}

async function expectReviewFilterGeometry(tablist: Locator): Promise<void> {
  const tabs = await tablist.getByRole("tab").evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      const content = document.createRange();
      content.selectNodeContents(element);
      const contentRect = content.getBoundingClientRect();
      return {
        label: element.textContent?.trim() ?? "",
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        contentLeft: contentRect.left,
        contentRight: contentRect.right,
        contentTop: contentRect.top,
        contentBottom: contentRect.bottom,
      };
    }),
  );
  expect(tabs).toHaveLength(4);
  for (const [index, tab] of tabs.entries()) {
    expect(tab.contentLeft).toBeGreaterThanOrEqual(tab.left - 1);
    expect(
      tab.contentRight,
      `${tab.label} stays inside its filter tab`,
    ).toBeLessThanOrEqual(tab.right + 1);
    expect(tab.contentTop).toBeGreaterThanOrEqual(tab.top - 1);
    expect(tab.contentBottom).toBeLessThanOrEqual(tab.bottom + 1);
    for (const other of tabs.slice(index + 1)) {
      const overlapWidth =
        Math.min(tab.right, other.right) - Math.max(tab.left, other.left);
      const overlapHeight =
        Math.min(tab.bottom, other.bottom) - Math.max(tab.top, other.top);
      expect(
        overlapWidth <= 1 || overlapHeight <= 1,
        `${tab.label} overlaps ${other.label}`,
      ).toBe(true);
    }
  }
  const narrow = await tablist.evaluate(() => window.innerWidth <= 620);
  if (narrow) {
    for (const tab of tabs) expect(tab.height).toBeGreaterThanOrEqual(44);
  }
}

async function expectResourceStatusContentGeometry(
  bar: Locator,
): Promise<void> {
  const geometry = await bar.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll("span")]
      .filter((span) => Boolean(span.textContent?.trim()))
      .map((span) => {
        const content = document.createRange();
        content.selectNodeContents(span);
        const text = content.getBoundingClientRect();
        return {
          label: span.textContent?.trim(),
          contained:
            text.left >= bounds.left - 1 &&
            text.right <= bounds.right + 1 &&
            text.top >= bounds.top - 1 &&
            text.bottom <= bounds.bottom + 1,
        };
      });
  });
  expect(geometry.length).toBeGreaterThanOrEqual(2);
  for (const part of geometry) {
    expect(part.contained, `${part.label} stays inside the status bar`).toBe(
      true,
    );
  }
}

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
    const reviewFixtureName = `.doolittle-e2e-review-${process.pid}-${Date.now()}.md`;
    const reviewFixturePath = join(repoRoot, reviewFixtureName);
    let reviewFixtureCreated = false;
    let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
    testInfo.annotations.push({
      type: "fixture",
      description:
        "Synthetic untracked Markdown exercises Review using real local Git/IPC. It is not completed agent work or provider output; the empty state uses an owned empty workspace.",
    });
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({
        currentPath: repoRoot,
        recentPaths: [repoRoot, alternateWorkspace],
      })}\n`,
      "utf8",
    );
    try {
      // A clean CI checkout must still exercise all populated Review controls.
      // Exclusive creation never overwrites existing repository content.
      writeFileSync(
        reviewFixturePath,
        "# Synthetic Review E2E fixture\n\nRenderer geometry fixture only; not agent work or a model/provider response.\n",
        { encoding: "utf8", flag: "wx" },
      );
      reviewFixtureCreated = true;
      app = await electron.launch({
        args: [desktopRoot, `--user-data-dir=${profileDir}`],
        cwd: repoRoot,
        env: {
          ...isolatedRuntimeEnvironment(join(profileDir, "runtime")),
          DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
          DOOLITTLE_DESKTOP_CWD: repoRoot,
        },
      });
      const page = await app.firstWindow();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
      });
      await expect(page).toHaveTitle(/Doolittle$/);
      expect(pageErrors).toEqual([]);
      await expectNoDesktopRecovery(page);
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
      // Real SDK/API isolation proof, not a mocked task-creation response.
      const initialTaskCount = await page.evaluate(async () => {
        const response = await window.doolittle.requestAgent({
          requestId: crypto.randomUUID(),
          path: "/delegation/tasks?limit=1",
          method: "GET",
          headers: { accept: "application/json" },
        });
        if (response.status !== 200) {
          throw new Error(
            `Task isolation probe failed with ${response.status}.`,
          );
        }
        const result = JSON.parse(response.body) as { tasks: unknown[] };
        return result.tasks.length;
      });
      expect(
        initialTaskCount,
        "a fresh fixture must not inherit SDK tasks",
      ).toBe(0);
      // This route/navigation smoke deliberately exercises one focused view;
      // multi-view arrangement has dedicated workbench E2E coverage.
      const focusedSessionPanel = page
        .locator("[data-session-panel]:visible")
        .first();
      const shellBeforeCommandMenu = await page
        .locator(".desktop-shell")
        .boundingBox();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+K" : "Control+K",
      );
      const commandMenu = page.getByRole("dialog", { name: "Command menu" });
      await expect(commandMenu).toBeVisible();
      await expect(commandMenu.getByText("Quick actions")).toBeVisible();
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
        "Open active runs",
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
              requestId: crypto.randomUUID(),
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
      // Independently cover the settled empty state, before any research task.
      // This owned workspace has no repository changes, approvals, or checks.
      try {
        await page.evaluate(async (workspacePath) => {
          await window.doolittle.switchWorkspace(workspacePath);
          window.location.hash = "#/review";
        }, alternateWorkspace);
        const emptyReview = page.locator(".review-page");
        await expect(emptyReview).toHaveAttribute(
          "data-workspace-path",
          alternateWorkspace,
        );
        await expect(
          emptyReview.locator(".resource-status-bar"),
        ).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        await expect(emptyReview.locator(".loading-block")).toHaveCount(0);
        await expect(
          emptyReview.getByRole("region", {
            name: "Current agent work outcome",
            exact: true,
          }),
        ).toHaveAttribute("data-review-empty", "true");
        await expect(emptyReview).toContainText("No completed work yet");
        await expect(emptyReview.locator(".review-workspace")).toHaveCount(0);
        await expect(
          emptyReview.getByRole("tablist", { name: "Review filters" }),
        ).toHaveCount(0);
      } finally {
        await page.evaluate(async (workspacePath) => {
          await window.doolittle.switchWorkspace(workspacePath);
          window.location.hash = "#/chat";
        }, repoRoot);
      }
      await expect(
        page.getByRole("toolbar", { name: "Conversation controls" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Collapse navigation" }).click();
      await expect(page.locator(".desktop-shell")).toHaveClass(/nav-collapsed/);
      await page.getByRole("button", { name: "Expand navigation" }).click();
      await expect(page.locator(".desktop-shell")).not.toHaveClass(
        /nav-collapsed/,
      );

      const sidebarResizer = page.getByRole("separator", {
        name: "Resize bot navigation",
      });
      await sidebarResizer.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem("doolittle.desktop.layout.sidebar-width.v2"),
          ),
        )
        .not.toBe("252");

      await focusedSessionPanel
        .getByRole("button", { name: /^Choose project\./ })
        .click();
      await page
        .getByRole("button", { name: "Manage projects", exact: true })
        .click();
      const projectManager = page.getByRole("dialog", { name: "Projects" });
      await expect(projectManager).toBeVisible();
      await projectManager
        .getByRole("button", { name: "New", exact: true })
        .click();
      const projectEditor = page.getByRole("dialog", {
        name: "Create a project",
      });
      const projectName = projectEditor.getByRole("textbox", { name: "Name" });
      await projectName.fill("Discarded project draft");
      await page.keyboard.press("Escape");
      await expect(projectEditor).toBeHidden();
      await expect(projectManager).toBeVisible();
      await expect(
        projectManager.getByRole("button", { name: "New", exact: true }),
      ).toBeFocused();
      await projectManager
        .getByRole("button", { name: "New", exact: true })
        .click();
      await expect(
        page
          .getByRole("dialog", { name: "Create a project" })
          .getByRole("textbox", { name: "Name" }),
      ).toHaveValue("");
      await page.getByRole("textbox", { name: "Name" }).fill("E2E repository");
      await page.getByRole("button", { name: "Create project" }).click();
      await page.getByRole("button", { name: "Close projects" }).click();

      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await page
        .getByRole("button", { name: "Conversation", exact: true })
        .click();
      const repositoryScope = page.getByRole("button", {
        name: /^Choose project\./,
      });
      await repositoryScope.click();
      await page
        .getByRole("button", { name: /General No repository context/ })
        .click();
      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      await expect(
        page.locator('.view-container[data-view="code"]'),
      ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/code");
      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      const projectScope = page.getByRole("button", {
        name: /^Choose project\./,
      });
      await projectScope.click();
      await page.getByRole("button", { name: /E2E repository/ }).click();
      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      await expect(
        page.locator('.view-container[data-view="code"]'),
      ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/code");
      await expect(page.locator(".view-code .coding-grid")).toBeVisible();
      const filesPane = page.getByRole("tabpanel", { name: "Files" });
      const workspaceTree = filesPane.getByRole("tree", {
        name: "Workspace files",
      });
      const workspaceTreeRetry = filesPane.getByRole("button", {
        name: "Try again",
      });
      const emptyWorkspaceHeading = filesPane.getByRole("heading", {
        name: "Workspace is empty",
        exact: true,
      });
      // Switching workspaces and entering Code starts an async tree request.
      // Wait for a terminal UI state; a populated repository must still render
      // the tree (the error and empty states are not accepted as success).
      await Promise.race([
        workspaceTree.waitFor({ state: "visible", timeout: 30_000 }),
        workspaceTreeRetry.waitFor({ state: "visible", timeout: 30_000 }),
        emptyWorkspaceHeading.waitFor({ state: "visible", timeout: 30_000 }),
      ]);
      await expect(workspaceTreeRetry).toHaveCount(0);
      await expect(emptyWorkspaceHeading).toHaveCount(0);
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
      const workspaceUtilities = page.getByRole("tablist", {
        name: "Workspace utilities",
      });
      if (!(await workspaceUtilities.isVisible())) {
        await page
          .getByRole("button", { exact: true, name: "Utility" })
          .click();
      }
      await expect(workspaceUtilities).toBeVisible();
      await workspaceUtilities.getByRole("tab", { name: "Shell" }).click();
      await page.getByRole("button", { name: "Focus shared terminal" }).click();
      const chatTerminal = page.getByLabel("Chat terminal panel");
      await expect(chatTerminal).toHaveAttribute("data-open", "true");
      await expect(chatTerminal).toBeVisible();
      await expect(
        chatTerminal.getByRole("button", {
          name: "Interrupt foreground process",
        }),
      ).toBeVisible({ timeout: 15_000 });
      const terminalMode = chatTerminal.locator(".interactive-terminal-mode");
      // The mode capsule is intentionally compact-only on narrower desktop
      // widths; assert the status content without forcing the 2xl layout.
      await expect(terminalMode).toHaveText(/(?:PTY|PIPE) · \d+×\d+/);
      await expect(terminalMode).not.toContainText("100×30");
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

      const projectScopeBeforeNewConversation = await page.evaluate(() =>
        localStorage.getItem("doolittle.desktop.project-scope.v1"),
      );
      expect(projectScopeBeforeNewConversation).toBeTruthy();
      const sessionPanels = page.locator("[data-session-panel]");
      const previousPanelCount = await sessionPanels.count();
      await page
        .getByRole("complementary", { name: "Navigation and bots" })
        .getByRole("button", { exact: true, name: "New conversation" })
        .click();
      await expect
        .poll(() => sessionPanels.count())
        .toBeGreaterThan(previousPanelCount);
      await expect(
        page.getByRole("toolbar", { name: "Conversation controls" }),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeVisible();
      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      await expect(
        page.locator('.view-container[data-view="code"]'),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem("doolittle.desktop.project-scope.v1"),
          ),
        )
        .toBe(projectScopeBeforeNewConversation);
      await expect(
        chatTerminal.getByRole("button", {
          name: "Interrupt foreground process",
        }),
      ).toBeVisible({ timeout: 15_000 });
      const terminalInput = chatTerminal
        .getByRole("tabpanel")
        .getByRole("textbox", { name: "Terminal input" });
      await expect(terminalInput).toBeEnabled({ timeout: 15_000 });
      await chatTerminal.getByRole("tabpanel").click();
      await page.keyboard.type("printf 'DOOLITTLE_%s\\n' TERMINAL_HANDOFF");
      await page.keyboard.press("Enter");
      await expect
        .poll(() =>
          page.evaluate((needle) => {
            const prefix = "doolittle.desktop.interactive-terminal.v3:";
            for (
              let index = 0;
              index < window.localStorage.length;
              index += 1
            ) {
              const key = window.localStorage.key(index);
              if (!key?.startsWith(prefix)) continue;
              const value = window.localStorage.getItem(key);
              if (!value) continue;
              try {
                const parsed = JSON.parse(value) as {
                  tabs?: Array<{ output?: unknown }>;
                };
                const output = Array.isArray(parsed.tabs)
                  ? parsed.tabs
                      .map((tab) =>
                        typeof tab?.output === "string" ? tab.output : "",
                      )
                      .join("\n")
                  : "";
                if (output.includes(needle)) return output;
              } catch {
                // Ignore unrelated localStorage state while polling.
              }
            }
            return "";
          }, "DOOLITTLE_TERMINAL_HANDOFF"),
        )
        .toContain("DOOLITTLE_TERMINAL_HANDOFF");

      await expect
        .poll(() =>
          page.evaluate(() => {
            const prefix = "doolittle.desktop.interactive-terminal.v3:";
            for (
              let index = 0;
              index < window.localStorage.length;
              index += 1
            ) {
              const key = window.localStorage.key(index);
              if (!key?.startsWith(prefix)) continue;
              const value = window.localStorage.getItem(key);
              if (!value) continue;
              try {
                const parsed = JSON.parse(value) as {
                  tabs?: Array<{ output?: unknown }>;
                };
                const output = Array.isArray(parsed.tabs)
                  ? parsed.tabs
                      .map((tab) =>
                        typeof tab?.output === "string" ? tab.output : "",
                      )
                      .join("\n")
                  : "";
                if (output.includes("DOOLITTLE_TERMINAL_HANDOFF")) return true;
              } catch {
                // Ignore unrelated localStorage state while polling.
              }
            }
            return false;
          }),
        )
        .toBe(true);
      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await expect(
        page.locator('.view-container[data-view="chat"]'),
      ).toBeVisible();

      await chatTerminal
        .getByRole("button", { name: "Add terminal output to chat" })
        .click();
      await expect(chatTerminal).toHaveAttribute("data-open", "false");
      await expect(chatTerminal).toHaveCount(0);
      const terminalContextCapsule = focusedSessionPanel.locator(
        ".chat-context-capsule",
      );
      await expect(terminalContextCapsule).toContainText("Terminal · Terminal");
      await expect(
        terminalContextCapsule.getByRole("button", {
          name: "Remove Terminal from message context",
        }),
      ).toBeVisible();
      await expect(
        focusedSessionPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeFocused();

      // The terminal handoff deliberately proves that a General chat keeps an
      // unscoped conversation while moving between Chat and Code. The
      // orchestration receipt below instead verifies a repository-scoped task,
      // so restore the E2E project before starting that independent flow.
      await page.getByRole("button", { name: /^Choose project\./ }).click();
      await page.getByRole("button", { name: /E2E repository/ }).click();

      const verifyAllRoutes = async () => {
        for (const [route] of routes) {
          await page.evaluate((nextRoute) => {
            window.location.hash = `#/${nextRoute}`;
          }, route);
          await expectNoDesktopRecovery(page);
          const routeContainer = page.locator(
            `.view-container[data-view="${route}"]`,
          );
          await expect(routeContainer).toBeVisible();
          if (route === "chat") {
            await expect(
              page.getByRole("toolbar", { name: "Conversation controls" }),
            ).toBeVisible();
          }
          const viewContainer =
            route === "chat" || route === "sessions" || route === "media"
              ? routeContainer.locator("[data-session-panel]:visible").first()
              : routeContainer;
          await expect(viewContainer).toBeVisible();
          if (route === "code") {
            await expectEditorToolbarGeometry(
              viewContainer.locator(".coding-editor-toolbar"),
            );
          }
          if (route === "review") {
            await expect(
              viewContainer.getByRole("region", {
                name: "Current agent work outcome",
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              viewContainer.getByText("Assembling completed work…", {
                exact: true,
              }),
            ).toHaveCount(0, { timeout: 30_000 });
            await expect(
              viewContainer.locator(".resource-status-bar"),
            ).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
            await expect(
              viewContainer.getByRole("button").filter({
                hasText: reviewFixtureName,
              }),
            ).toHaveCount(1);
            await expect(
              viewContainer.getByRole("tablist", { name: "Review filters" }),
            ).toBeVisible();
            await expectReviewFilterGeometry(
              viewContainer.getByRole("tablist", { name: "Review filters" }),
            );
            await expectResourceStatusContentGeometry(
              viewContainer.locator(".resource-status-bar"),
            );
          }
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
              viewContainer.locator(".setup-readiness"),
            ).toBeVisible();
            await expect(
              viewContainer.locator(".compact-stat-strip"),
            ).toBeVisible();
            await expect(
              viewContainer.locator(".compact-stat-strip__item"),
            ).toHaveCount(3);
            await expect(
              viewContainer.getByLabel("Core readiness"),
            ).not.toContainText("Readiness");
            await expect(viewContainer.locator(".two-column-grid")).toHaveCount(
              0,
            );
            await expect(
              viewContainer.getByText("Subscription account pools", {
                exact: true,
              }),
            ).toBeVisible();
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
              name: /^(?:Blank workflow|New automation|Open builder)$/u,
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
            const emptyHistory = viewContainer.locator(
              ".gateway-history-state.is-empty",
            );
            if ((await emptyHistory.count()) > 0) {
              await expect(emptyHistory).toContainText(
                "Waiting for gateway traffic",
              );
              await expect(
                viewContainer.locator(".gateway-timeline-panel .empty-block"),
              ).toHaveCount(0);
              const emptyHistoryHeight = await emptyHistory.evaluate(
                (element) => Math.round(element.getBoundingClientRect().height),
              );
              expect(emptyHistoryHeight).toBeLessThanOrEqual(72);
            }
            const pairing = viewContainer.locator(".pairing-panel");
            await pairing.locator("summary").click();
            await expect(pairing).toHaveAttribute("open", "");
            await pairing.locator("summary").click();
            await expect(pairing).not.toHaveAttribute("open", "");
          }
          if (route === "models") {
            await expect(
              viewContainer.getByRole("heading", {
                name: "Provider & model",
              }),
            ).toBeVisible({ timeout: 30_000 });
            const diagnostics = viewContainer.locator(".model-diagnostic");
            await expect(diagnostics).toHaveCount(2);
            await expect(diagnostics.nth(0)).not.toHaveAttribute("open");
            await diagnostics.nth(0).locator("summary").click();
            await expect(diagnostics.nth(0)).toHaveAttribute("open", "");
            await diagnostics.nth(0).locator("summary").click();
            await expect(diagnostics.nth(0)).not.toHaveAttribute("open");
          }
          if (route === "plugins") {
            const pluginWorkspace = viewContainer.locator(
              ".plugin-catalog-workspace",
            );
            await expect(pluginWorkspace.getByRole("tab")).toHaveCount(8);
            await expect(
              pluginWorkspace.getByRole("button", { name: "Show 8 more" }),
            ).toBeVisible();
            const pluginGeometry = await pluginWorkspace.evaluate((element) => {
              const facts = element.querySelector(".catalog-browser__facts");
              if (!facts) throw new Error("Missing plugin facts.");
              return {
                columns: getComputedStyle(facts)
                  .gridTemplateColumns.split(" ")
                  .filter(Boolean).length,
                height: Math.round(element.getBoundingClientRect().height),
              };
            });
            expect(pluginGeometry.columns).toBe(2);
            expect(pluginGeometry.height).toBeLessThanOrEqual(520);
          }
          if (route === "logs") {
            const traces = viewContainer.locator(".operations-trace-details");
            await traces.locator("summary").click();
            await expect(traces).toHaveAttribute("open", "");
            await traces.locator("summary").click();
            await expect(traces).not.toHaveAttribute("open", "");
          }
          if (route === "settings") {
            const settingsNavigation = viewContainer.getByRole(
              "complementary",
              { name: "Settings categories" },
            );
            await expect(settingsNavigation).toBeVisible();
            const settingsCategories = [
              [/^Appearance:/u, "Appearance & desktop"],
              [/^Desktop:/u, "Appearance & desktop"],
              [/^Execution:/u, "Runtime & diagnostics"],
              [/^Advanced:/u, "Runtime & diagnostics"],
            ] as const;
            for (const [categoryName, groupName] of settingsCategories) {
              const categoryButton = settingsNavigation.getByRole("button", {
                name: categoryName,
              });
              if (!(await categoryButton.isVisible())) {
                await settingsNavigation
                  .locator("summary")
                  .filter({ hasText: groupName })
                  .click();
              }
              await categoryButton.click();
              const settingsHeader = viewContainer.locator(
                ".settings-content-header",
              );
              await expect(settingsHeader).toBeVisible();
              const geometry = await viewContainer.evaluate((element) => {
                const pageHeader = element.querySelector(".page-header");
                const layout = element.querySelector(".settings-layout");
                const content = element.querySelector(".settings-content");
                const header = element.querySelector(
                  ".settings-content-header",
                );
                const next = header?.nextElementSibling;
                if (!(pageHeader && layout && content && header)) {
                  throw new Error("Missing settings density geometry.");
                }
                const pageHeaderRect = pageHeader.getBoundingClientRect();
                const layoutRect = layout.getBoundingClientRect();
                const contentRect = content.getBoundingClientRect();
                const headerRect = header.getBoundingClientRect();
                const nextRect = next?.getBoundingClientRect();
                return {
                  contentOffset: Math.round(headerRect.top - contentRect.top),
                  headerHeight: Math.round(headerRect.height),
                  pageGap: Math.round(layoutRect.top - pageHeaderRect.bottom),
                  panelGap: nextRect
                    ? Math.round(nextRect.top - headerRect.bottom)
                    : 0,
                };
              });
              expect(geometry.contentOffset).toBeGreaterThanOrEqual(-1);
              expect(geometry.contentOffset).toBeLessThanOrEqual(2);
              // The reusable system uses 40px controls inside a compact 48px
              // header, rather than the previous smaller workbench targets.
              expect(geometry.headerHeight).toBeGreaterThanOrEqual(40);
              expect(geometry.headerHeight).toBeLessThanOrEqual(48);
              expect(geometry.pageGap).toBeLessThanOrEqual(8);
              expect(geometry.panelGap).toBeLessThanOrEqual(10);
            }
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
            const emptySessions = viewContainer.locator(
              ".session-empty-landing",
            );
            await expect(
              viewContainer.locator(
                ".session-empty-landing, [aria-label='Conversation history']",
              ),
            ).toBeVisible({ timeout: 30_000 });
            if (await emptySessions.isVisible()) {
              await expect(
                emptySessions.getByText("No saved conversations", {
                  exact: true,
                }),
              ).toBeVisible();
              await expect(
                emptySessions.getByRole("button", {
                  name: "New conversation",
                }),
              ).toBeVisible();
              await expect(
                emptySessions.getByRole("button", { name: "Import archive" }),
              ).toBeVisible();
              await expect(
                viewContainer.locator(".split-workspace.is-empty"),
              ).toBeVisible();
            } else {
              await expect(
                viewContainer.getByRole("region", {
                  name: "Conversation history",
                }),
              ).toBeVisible();
              await expect(
                viewContainer.getByRole("region", { name: "Conversations" }),
              ).toBeVisible();
            }
          }
          if (route === "analytics") {
            const emptyAnalytics = viewContainer.locator(
              ".analytics-empty-landing",
            );
            await expect(
              viewContainer.locator(
                ".analytics-empty-landing, .analytics-grid",
              ),
            ).toBeVisible({ timeout: 30_000 });
            if (await emptyAnalytics.isVisible()) {
              await expect(
                emptyAnalytics.getByRole("heading", {
                  name: "No local activity yet",
                }),
              ).toBeVisible();
              await expect(
                emptyAnalytics.getByRole("button", {
                  name: "Start conversation",
                }),
              ).toBeVisible();
            } else {
              await expect(
                viewContainer.locator(".analytics-grid"),
              ).toBeVisible();
              await expect(
                viewContainer.locator(".compact-stat-strip"),
              ).toBeVisible();
            }
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
            const hasLayoutTransition = (element: HTMLElement) =>
              window
                .getComputedStyle(element)
                .transitionProperty.split(",")
                .some((property) =>
                  /^(?:all|(?:min-|max-)?(?:width|height)|padding(?:-.+)?|margin(?:-.+)?|(?:row-|column-)?gap|grid-template-.+|flex-basis|font-size|line-height)$/u.test(
                    property.trim(),
                  ),
                );
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
              layoutTransitionFailures: controls
                .filter(hasLayoutTransition)
                .map(
                  (element) =>
                    `${element.tagName.toLowerCase()}.${element.className}`,
                ),
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
            layoutTransitionFailures: [],
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
        name: "Provider sign in",
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
          "Use your Codex or Claude subscription. Doolittle opens the official account flow and keeps credentials outside the UI.",
          { exact: true },
        ),
      ).toBeVisible();
      const providerHeaderLayout = await page
        .locator(".settings-section-header")
        .evaluate((element) => {
          const headerRect = element.getBoundingClientRect();
          const content = element.firstElementChild;
          const action = element.lastElementChild;
          const contentRect = content?.getBoundingClientRect();
          const actionRect = action?.getBoundingClientRect();
          return {
            actionRightGap: actionRect
              ? Math.round(headerRect.right - actionRect.right)
              : null,
            contentActionGap:
              contentRect && actionRect
                ? Math.round(actionRect.left - contentRect.right)
                : null,
          };
        });
      expect(providerHeaderLayout.actionRightGap).toBeLessThanOrEqual(4);
      expect(providerHeaderLayout.contentActionGap).toBeGreaterThanOrEqual(12);
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
        page.getByRole("region", {
          name: "OpenAI API spawned-agent account pool",
        }),
      ).toContainText("Accounts", { timeout: 30_000 });
      await expect(
        page.getByRole("region", {
          name: "Anthropic API spawned-agent account pool",
        }),
      ).toContainText("Accounts", { timeout: 30_000 });
      await expect(
        page.locator(".provider-pool-header-actions .badge"),
      ).toHaveCount(4, {
        timeout: 30_000,
      });
      await expect(page.locator(".provider-pool-directory")).toHaveCount(4);
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
      await expect(page.locator(".provider-import-disclosure")).toHaveCount(4);
      await expect(
        page.getByText("Checking the default chat provider…"),
      ).toHaveCount(0, { timeout: 30_000 });
      const providerStatus = page.locator(
        '[aria-label="Chat provider status"]',
      );
      await expect(providerStatus).toContainText("Ready");
      await expect(providerStatus).toContainText("New chats");
      await expect(page.locator(".provider-connection-row")).toHaveCount(4);
      await expect(page.locator(".provider-pool-panel")).toHaveCount(4);
      await expect(page.locator(".provider-pool-toolbar")).toHaveCount(4);
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
        page.getByRole("heading", { name: "Operations" }),
      ).toBeVisible();
      await expect(page.getByRole("tab", { name: /^Runs/ })).toBeVisible();
      await expect(page.getByRole("tab", { name: /^Review/ })).toBeVisible();
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
          requestId: crypto.randomUUID(),
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
        window.location.hash = "#/connections";
      });
      const connectionsViewport = page.locator(
        '.view-container[data-view="connections"]',
      );
      await expect(connectionsViewport).toBeVisible();
      await expect(
        connectionsViewport.getByRole("heading", {
          name: "Provider sign in",
        }),
      ).toBeVisible();
      const scrollFixture = connectionsViewport.locator(
        ".provider-routing-disclosure",
      );
      if (
        !(await scrollFixture.evaluate((element) =>
          element.hasAttribute("open"),
        ))
      ) {
        await scrollFixture.locator("summary").click();
      }
      await expect(scrollFixture).toHaveAttribute("open", "");
      await connectionsViewport.evaluate((container) => {
        // Always exercise the real route scrollport. Disclosure/account-pool
        // loading can briefly overflow and then shrink after a one-shot check.
        container.style.flex = "0 0 400px";
        container.style.height = "400px";
        container.style.maxHeight = "400px";
        container.style.minHeight = "0";
        container.style.overflowY = "auto";
        for (const fixture of container.querySelectorAll(
          '[data-e2e-scroll-fixture="connections-route-overflow"]',
        ))
          fixture.remove();
        const spacer = document.createElement("div");
        spacer.dataset.e2eScrollFixture = "connections-route-overflow";
        spacer.style.height = "1200px";
        spacer.style.minHeight = "1200px";
        spacer.style.flex = "0 0 1200px";
        spacer.setAttribute("aria-hidden", "true");
        container.append(spacer);
      });
      try {
        await expect(
          connectionsViewport.locator(
            '[data-e2e-scroll-fixture="connections-route-overflow"]',
          ),
        ).toHaveCount(1);
        await expect
          .poll(() =>
            connectionsViewport.evaluate(
              (container) => container.scrollHeight - container.clientHeight,
            ),
          )
          .toBeGreaterThan(0);
        await connectionsViewport.evaluate((container) => {
          container.scrollTop = container.scrollHeight;
        });
        await expect
          .poll(() =>
            connectionsViewport.evaluate((container) => container.scrollTop),
          )
          .toBeGreaterThan(0);
      } catch (error) {
        const dimensions = await connectionsViewport
          .evaluate((container) => {
            const spacers = container.querySelectorAll(
              '[data-e2e-scroll-fixture="connections-route-overflow"]',
            );
            return {
              clientHeight: container.clientHeight,
              scrollHeight: container.scrollHeight,
              scrollTop: container.scrollTop,
              spacerCount: spacers.length,
              spacerHeight: spacers[0]?.getBoundingClientRect().height ?? null,
            };
          })
          .catch(() => ({ unavailable: true }));
        await testInfo.attach("connections scroll fixture dimensions", {
          contentType: "application/json",
          body: JSON.stringify(dimensions),
        });
        throw error;
      }
      await page.evaluate(() => {
        window.location.hash = "#/dashboard";
      });
      const dashboardViewport = page.locator(
        '.view-container[data-view="dashboard"]',
      );
      await expect(dashboardViewport).toBeVisible();
      await expect
        .poll(() =>
          dashboardViewport.evaluate((container) => container.scrollTop),
        )
        .toBe(0);
      await dashboardViewport.evaluate((container) => {
        container.style.removeProperty("flex");
        container.style.removeProperty("height");
        container.style.removeProperty("max-height");
        container.style.removeProperty("min-height");
        container.style.removeProperty("overflow-y");
        container.style.removeProperty("padding-bottom");
      });
      await expect(
        dashboardViewport.getByRole("heading", { name: "Dashboard" }),
      ).toBeInViewport();

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
      const runtimeOverview = page.locator(".runtime-overview-grid");
      await expect(runtimeOverview.locator(":scope > section")).toHaveCount(2);
      await expect(page.locator(".runtime-autonomy-controls")).toBeVisible();
      expect(
        await runtimeOverview.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      expect(
        await page.locator(".runtime-autonomy-panel").evaluate((element) => {
          const panel = element.getBoundingClientRect();
          const controls = element
            .querySelector(".runtime-autonomy-controls")
            ?.getBoundingClientRect();
          return Boolean(
            controls &&
              controls.left >= panel.left &&
              controls.right <= panel.right + 1,
          );
        }),
      ).toBe(true);

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
      await memoryTabs
        .getByRole("tab", { name: /^Doolittle memory:/u })
        .click();
      await expect(
        memoryTabs.getByRole("tab", { name: /^Doolittle memory:/u }),
      ).toHaveAttribute("aria-selected", "true");

      await page.evaluate(() => {
        window.location.hash = "#/skills";
      });
      await page.getByRole("tab", { name: /Workshop/ }).click();
      await expect(
        page.getByText("Create a skill proposal", { exact: true }),
      ).toBeVisible();

      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      await expect(
        page.locator('.view-container[data-view="code"]'),
      ).toBeVisible();
      // The prior terminal-output handoff closes the global terminal by design. Open
      // it again before exercising its tab-management controls.
      const reopenedWorkspaceUtilities = page.getByRole("tablist", {
        name: "Workspace utilities",
      });
      if (!(await reopenedWorkspaceUtilities.isVisible())) {
        await page
          .getByRole("button", { exact: true, name: "Utility" })
          .click();
      }
      await reopenedWorkspaceUtilities
        .getByRole("tab", { name: "Shell" })
        .click();
      if (!(await chatTerminal.isVisible())) {
        await page
          .getByRole("button", { name: "Focus shared terminal" })
          .click();
      }
      await expect(chatTerminal).toHaveAttribute("data-open", "true");
      await expect(chatTerminal).toBeVisible();
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
      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await page.getByRole("button", { name: /^Choose project\./ }).click();
      await page
        .getByRole("button", { name: /General No repository context/ })
        .click();
      await page.evaluate(() => {
        window.location.hash = "#/work/review";
      });
      await expect(page.locator(".review-page")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/work/review");
      await expect(page.locator(".review-page")).toHaveAttribute(
        "data-project-scope",
        "unscoped",
      );
      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await page.getByRole("button", { name: /^Choose project\./ }).click();
      await page.getByRole("button", { name: /E2E repository/ }).click();
      await page.evaluate(() => {
        window.location.hash = "#/work/review";
      });
      await expect
        .poll(() => page.evaluate(() => window.location.hash))
        .toBe("#/work/review");
      await expect(page.locator(".review-page")).toHaveAttribute(
        "data-project-scope",
        /^[0-9a-f-]{36}$/,
      );
      const reviewWorkspace = page.locator(".review-workspace");
      const reviewEmptyState = page.locator(".review-work-overview.is-empty");
      // A queued review item can coexist with a neutral summary, so these are
      // not mutually exclusive states. Wait for either surface without a
      // strict-mode union locator, then exercise each surface that is present.
      await expect
        .poll(async () => {
          return (
            (await reviewWorkspace.isVisible()) ||
            (await reviewEmptyState.isVisible())
          );
        })
        .toBe(true);
      if (await reviewWorkspace.isVisible()) {
        await page.setViewportSize({ width: 390, height: 844 });
        const narrowReviewFilters = page.getByRole("tablist", {
          name: "Review filters",
        });
        const firstReviewFilter = narrowReviewFilters.getByRole("tab").first();
        const lastReviewFilter = narrowReviewFilters.getByRole("tab").last();
        await firstReviewFilter.focus();
        await firstReviewFilter.press("End");
        await expect(lastReviewFilter).toBeFocused();
        await expect(lastReviewFilter).toHaveAttribute("aria-selected", "true");
        await lastReviewFilter.press("Home");
        await expect(firstReviewFilter).toBeFocused();
        await expect(firstReviewFilter).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await narrowReviewFilters.scrollIntoViewIfNeeded();
        await expectReviewFilterGeometry(narrowReviewFilters);
        await expectResourceStatusContentGeometry(
          page.locator(".review-page .resource-status-bar"),
        );
        const filterVisibility = await narrowReviewFilters.evaluate(
          (element) => {
            const pageRect = element
              .closest(".review-page")
              ?.getBoundingClientRect();
            return [...element.querySelectorAll('[role="tab"]')].every(
              (tab) => {
                const bounds = tab.getBoundingClientRect();
                return (
                  Boolean(pageRect) &&
                  bounds.top >= (pageRect?.top ?? 0) - 1 &&
                  bounds.bottom <=
                    (pageRect?.bottom ?? window.innerHeight) + 1 &&
                  tab.contains(
                    document.elementFromPoint(
                      bounds.left + bounds.width / 2,
                      bounds.top + bounds.height / 2,
                    ),
                  )
                );
              },
            );
          },
        );
        expect(filterVisibility).toBe(true);
        await lastReviewFilter.click();
        await expect(lastReviewFilter).toHaveAttribute("aria-selected", "true");
        await firstReviewFilter.click();
        await expect(firstReviewFilter).toHaveAttribute(
          "aria-selected",
          "true",
        );
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
      }
      if (await reviewEmptyState.isVisible()) {
        await expect(reviewEmptyState).toContainText("No completed work yet");
      }

      await page.evaluate(() => {
        window.location.hash = "#/gateway";
      });
      await expect(
        page.getByRole("heading", { name: "Operations" }),
      ).toBeVisible();
      await expect(page.locator("#orchestration-tab-manage")).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.locator("#orchestration-tab-manage")).toHaveText(
        "Inbox",
      );

      await page.evaluate(() => {
        window.location.hash = "#/memory";
      });
      await expect(
        page.getByRole("heading", { name: "Memory & recall", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("tab", { name: /^Doolittle memory:/u }),
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
      const acpPanel = page.locator(
        'section[aria-labelledby="acp-bridge-heading"]',
      );
      const acpSearch = acpPanel.getByRole("textbox", {
        name: "Search ACP bridge tools",
      });
      const acpUnavailable = acpPanel.getByText(
        /Could not read the local ACP bridge:/u,
      );
      await expect
        .poll(
          async () =>
            (await acpSearch.isVisible()) || (await acpUnavailable.isVisible()),
          { timeout: 30_000 },
        )
        .toBe(true);
      if (await acpSearch.isVisible()) {
        await acpSearch.fill("workspace");
        await acpPanel
          .getByRole("button", { name: "Search", exact: true })
          .click();
        await expect(
          acpPanel
            .locator(".acp-bridge-tool-list")
            .getByText("DOOLITTLE_WORKSPACE", { exact: true }),
        ).toBeVisible({ timeout: 30_000 });
      } else {
        await expect(acpUnavailable).toBeVisible();
      }

      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await expect(page.locator(".chat-sessions")).toHaveCount(0);
      await expect(page.locator(".window-status-strip")).toHaveCount(0);
      // A healthy, idle composer hides transient operational status.
      await expect(
        focusedSessionPanel.locator(".chat-composer-status"),
      ).toHaveCount(0);
      const historyScrollport = await page
        .getByRole("navigation", { name: "Bots and conversations" })
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

      const composer = focusedSessionPanel.getByRole("textbox", {
        name: "Message Doolittle",
      });
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
          outline: containerStyle.outlineStyle,
          outlineWidth: containerStyle.outlineWidth,
          outlineOffset: containerStyle.outlineOffset,
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
          outline: containerStyle.outlineStyle,
          outlineWidth: containerStyle.outlineWidth,
          outlineOffset: containerStyle.outlineOffset,
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
      // The operator system uses an explicit keyboard ring, not a focus glow.
      expect(focusedComposerStyle.boxShadow).toBe(
        restingComposerStyle.boxShadow,
      );
      expect(focusedComposerStyle.outline).toBe("solid");
      expect(focusedComposerStyle.outlineWidth).toBe("2px");
      expect(focusedComposerStyle.outlineOffset).toBe("2px");
      expect(focusedComposerStyle.outlineWidth).not.toBe(
        restingComposerStyle.outlineWidth,
      );
      expect(focusedComposerStyle.textareaBoxShadow).toBe("none");
      expect(focusedComposerStyle.textareaOutline).toBe("none");
      await composer.fill("Draft survives project switching");
      await focusedSessionPanel
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
      await focusedSessionPanel
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

      await focusedSessionPanel
        .getByRole("button", { name: /Choose model\. Current route/ })
        .click();
      await expect(
        page.locator('[aria-label="Choose provider and model"]').filter({
          has: page.getByRole("textbox", { name: "Search models" }),
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Search models" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Providers & accounts" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Refresh model catalog" }),
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

      const inspectorToggle = page.getByRole("button", {
        name: "Open inspector",
      });
      await inspectorToggle.click();
      const workbench = page.locator(".chat-workbench-pane");
      const inspectorTabs = workbench.getByRole("tablist", {
        name: "Inspector views",
      });
      await expect(inspectorTabs.getByRole("tab")).toHaveText([
        "Details",
        "Library",
        "Computer",
      ]);
      await inspectorTabs.getByRole("tab", { name: "Library" }).click();
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
        workbench.locator(".thread-workbench-monaco .monaco-editor"),
      ).toBeVisible();
      await expect(
        workbench.locator(".thread-workbench-code-preview"),
      ).toContainText("Markdown");
      const workbenchEdges = await workbench.evaluate((element) => {
        const wrapper = element.getBoundingClientRect();
        const panel = element
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
      await expect(
        focusedSessionPanel.locator(".chat-conversation"),
      ).toHaveAttribute("inert", "");
      await expect
        .poll(() =>
          narrowWorkbenchDialog.evaluate((dialog) =>
            dialog.contains(document.activeElement),
          ),
        )
        .toBe(true);
      const narrowWorkbenchLayout = await workbench.evaluate((element) => {
        const wrapper = element.getBoundingClientRect();
        const panel = element
          .querySelector(".thread-workbench")
          ?.getBoundingClientRect();
        const close = element
          .querySelector('[aria-label="Close inspector"]')
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
        "doolittle-library-inspector-narrow.png",
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: narrowWorkbenchScreenshot,
      });
      await testInfo.attach("library inspector narrow", {
        contentType: "image/png",
        path: narrowWorkbenchScreenshot,
      });
      await narrowWorkbenchDialog
        .getByRole("button", { name: "Close inspector" })
        .click();
      await expect(inspectorToggle).toBeFocused();
      await page.setViewportSize({ width: 1280, height: 900 });
      await inspectorToggle.click();
      await workbench.getByRole("tab", { name: "Computer" }).click();
      const computerTabs = workbench.getByRole("tablist", {
        name: "Thread context views",
      });
      await computerTabs.getByRole("tab", { name: "Brief" }).click();
      await expect(
        computerTabs.getByRole("tab", { name: "Brief" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        workbench.getByRole("heading", { name: "Current plan" }),
      ).toBeVisible();
      const workbenchScreenshot = testInfo.outputPath(
        "doolittle-companion-computer.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: workbenchScreenshot,
      });
      await testInfo.attach("computer inspector", {
        contentType: "image/png",
        path: workbenchScreenshot,
      });
      await workbench.getByRole("button", { name: "Close inspector" }).click();

      await page.getByRole("button", { name: "Open Activity" }).click();
      const activityPanel = page.locator('aside[aria-label="Activity"]');
      await expect(activityPanel).toBeVisible();
      await expect(
        activityPanel.getByRole("heading", { name: "Activity", exact: true }),
      ).toBeVisible();
      await expect(
        activityPanel.getByRole("heading", { name: "Recent activity" }),
      ).toBeVisible();
      const activityResizer = page.getByRole("separator", {
        name: "Resize Activity panel",
      });
      await activityResizer.focus();
      await page.keyboard.press("ArrowLeft");
      await expect
        .poll(() =>
          page.evaluate(() =>
            localStorage.getItem(
              "doolittle.desktop.layout.utility-drawer-width.v2",
            ),
          ),
        )
        .not.toBe("520");
      const activityDrawerScreenshot = testInfo.outputPath(
        "doolittle-activity-drawer.png",
      );
      await page.screenshot({
        animations: "disabled",
        path: activityDrawerScreenshot,
      });
      await testInfo.attach("activity drawer", {
        contentType: "image/png",
        path: activityDrawerScreenshot,
      });
      await activityPanel
        .getByRole("button", { name: "Close Activity" })
        .click();
      await expect(activityPanel).toHaveCount(0);

      await page.getByRole("button", { name: "Open command palette" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      try {
        await app?.close();
      } finally {
        if (reviewFixtureCreated) rmSync(reviewFixturePath, { force: true });
        rmSync(profileDir, { force: true, recursive: true });
        rmSync(alternateWorkspace, { force: true, recursive: true });
      }
    }
  });
});
