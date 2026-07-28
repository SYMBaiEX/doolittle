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
  ["review", "Review"],
  ["orchestration", "Tasks & agents"],
  ["media", "Media studio"],
  ["automations", "Automations"],
  ["sessions", "Sessions"],
  ["gateway", "Gateway inbox"],
  ["activity", "Activity"],
  ["analytics", "Analytics"],
  ["models", "Models"],
  ["connections", "Connections"],
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

test.describe("Doolittle desktop navigation", () => {
  test("boots the real Electron shell and renders every application route", async ({
    browserName,
  }, testInfo) => {
    expect(browserName).toBe("chromium");
    const profileDir = mkdtempSync(join(tmpdir(), "doolittle-e2e-desktop-"));
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
      },
    });

    try {
      const page = await app.firstWindow();
      await expect(page).toHaveTitle("Doolittle");
      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 45_000 },
      );
      const liveWorkspaceHandoff = await page.evaluate(
        async ({ alternateWorkspace, repoRoot }) => {
          const beforeState = await window.doolittle.getBackendState();
          const beforeHealth = await window.doolittle.api<{
            processId: number;
            workspaceDir: string;
          }>({ path: "/health" });
          await window.doolittle.switchWorkspace(alternateWorkspace);
          const alternateState = await window.doolittle.getBackendState();
          const alternateHealth = await window.doolittle.api<{
            processId: number;
            workspaceDir: string;
          }>({ path: "/health" });
          await window.doolittle.switchWorkspace(repoRoot);
          const restoredState = await window.doolittle.getBackendState();
          const restoredHealth = await window.doolittle.api<{
            processId: number;
            workspaceDir: string;
          }>({ path: "/health" });
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
      await page.getByRole("button", { name: "+ New" }).click();
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

      for (const [route, label] of routes) {
        await page.evaluate((nextRoute) => {
          window.location.hash = `#/${nextRoute}`;
        }, route);
        await expect(page.locator(".window-context strong")).toHaveText(label);
        await expect(page.locator(".recovery-shell")).toHaveCount(0);
      }

      await page.evaluate(() => {
        window.location.hash = "#/skills";
      });
      await page.getByRole("tab", { name: /Workshop/ }).click();
      await expect(
        page.getByRole("heading", { name: "Skill Workshop" }),
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
      await expect(
        page.locator('section[aria-label="Branch record"]'),
      ).toBeVisible();

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
        page.getByRole("heading", { name: "Shared memory" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Rolodex summary" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Operator card" }),
      ).toBeVisible();

      await page.evaluate(() => {
        window.location.hash = "#/tools";
      });
      await expect(
        page.getByRole("heading", { name: "ACP bridge" }),
      ).toBeVisible();
      await expect(page.locator(".acp-bridge-summary")).toBeVisible();
      await expect(page.locator(".acp-bridge-summary")).toContainText(
        "Registered tools",
      );
      await page
        .getByRole("textbox", { name: "Search ACP bridge tools" })
        .fill("workspace");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(
        page
          .locator(".acp-bridge-tool-list")
          .getByText("workspace.search", { exact: true }),
      ).toBeVisible();

      await page.evaluate(() => {
        window.location.hash = "#/chat";
      });
      await expect(page.locator(".chat-sessions")).toHaveCount(0);
      await expect(page.locator(".window-status-strip")).toHaveCount(0);
      await expect(page.locator(".chat-status-runtime")).toContainText("Ready");
      await expect(
        page.getByRole("button", { name: /^History \d+$/ }),
      ).toBeVisible();

      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
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
        page.getByRole("dialog", { name: "Tools and settings" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Tools & settings" }),
      ).toBeVisible();
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
