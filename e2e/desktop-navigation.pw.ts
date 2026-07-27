import { mkdtempSync, rmSync } from "node:fs";
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
  test("boots the real Electron shell and renders every application route", async () => {
    const profileDir = mkdtempSync(join(tmpdir(), "doolittle-e2e-desktop-"));
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
      await expect(
        page.getByText("Runtime connected", { exact: true }),
      ).toBeVisible({
        timeout: 45_000,
      });

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
      await page.getByRole("button", { name: "Show workbench" }).click();
      await page.getByRole("tab", { name: /Brief/ }).click();
      await expect(
        page.getByRole("heading", { name: "Workspace pulse" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Open command palette" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await app.close();
      rmSync(profileDir, { force: true, recursive: true });
    }
  });
});
