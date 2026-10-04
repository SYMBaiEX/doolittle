import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import { expectNoDesktopRecovery } from "./support/desktop-assertions";
import {
  launchIsolatedDesktop,
  waitForDesktopReady,
} from "./support/doolittle-workbench-app";
import {
  installSyntheticApprovalFixture,
  rebindSyntheticApprovalSessions,
  releaseSyntheticApprovalListFailure,
  syntheticApprovalFixtureState,
} from "./support/doolittle-workbench-approval-fixture";
import {
  installSyntheticChatLifecycleFixture,
  syntheticChatPrompt,
} from "./support/doolittle-workbench-chat-fixture";

const screenshotRoot = resolve(
  process.cwd(),
  "output/playwright/session-workbench",
);

function panelById(workbench: Locator, id: string) {
  return workbench.locator(`[data-session-panel="${id}"]`);
}

async function expectComposerGeometry(panel: Locator): Promise<void> {
  const geometry = await panel
    .locator(".chat-composer")
    .evaluate((composer) => {
      const bounds = composer.getBoundingClientRect();
      const panelElement = composer.closest("[data-session-panel]");
      const rect = (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height, right: x + width, bottom: y + height };
      };
      return {
        composer: rect(composer),
        textarea: (() => {
          const textarea = composer.querySelector("textarea");
          return textarea ? rect(textarea) : null;
        })(),
        footer: (() => {
          const footer = composer.querySelector(".chat-composer-footer");
          return footer ? rect(footer) : null;
        })(),
        buttons: [...composer.querySelectorAll(".chat-composer-footer button")]
          .filter((button) => {
            const style = getComputedStyle(button);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              button.getBoundingClientRect().width > 0
            );
          })
          .map((button) => ({
            label:
              button.getAttribute("aria-label") ?? button.textContent?.trim(),
            ...rect(button),
          })),
        panel: panelElement ? rect(panelElement) : null,
        composerBounds: { left: bounds.left, right: bounds.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });

  expect(
    geometry.panel,
    "composer should belong to a session panel",
  ).not.toBeNull();
  const panelBounds = geometry.panel;
  if (!panelBounds) throw new Error("Session panel geometry is unavailable.");
  const textarea = geometry.textarea;
  expect(textarea, "composer textarea should be present").not.toBeNull();
  if (!textarea) throw new Error("Composer textarea geometry is unavailable.");
  expect(geometry.composer.x).toBeGreaterThanOrEqual(panelBounds.x - 1);
  expect(geometry.composer.right).toBeLessThanOrEqual(panelBounds.right + 1);
  expect(
    geometry.composer.y,
    "composer should remain inside the visible session panel",
  ).toBeGreaterThanOrEqual(panelBounds.y - 1);
  expect(
    geometry.composer.bottom,
    "composer should remain inside the visible session panel and viewport",
  ).toBeLessThanOrEqual(
    Math.min(panelBounds.bottom, geometry.viewport.height) + 1,
  );
  expect(textarea.x).toBeGreaterThanOrEqual(geometry.composer.x - 1);
  expect(textarea.right).toBeLessThanOrEqual(geometry.composer.right + 1);
  expect(textarea.y).toBeGreaterThanOrEqual(geometry.composer.y - 1);
  expect(textarea.bottom).toBeLessThanOrEqual(geometry.composer.bottom + 1);
  expect(textarea.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  if (geometry.footer) {
    expect(geometry.footer.y).toBeGreaterThanOrEqual(geometry.composer.y - 1);
    expect(geometry.footer.bottom).toBeLessThanOrEqual(
      geometry.composer.bottom + 1,
    );
    expect(geometry.footer.bottom).toBeLessThanOrEqual(
      Math.min(panelBounds.bottom, geometry.viewport.height) + 1,
    );
  }

  for (const [index, button] of geometry.buttons.entries()) {
    expect(
      button.x,
      `${button.label} should stay inside composer`,
    ).toBeGreaterThanOrEqual(geometry.composerBounds.left - 1);
    expect(
      button.right,
      `${button.label} should stay inside composer`,
    ).toBeLessThanOrEqual(geometry.composerBounds.right + 1);
    expect(
      button.y,
      `${button.label} should stay inside composer`,
    ).toBeGreaterThanOrEqual(geometry.composer.y - 1);
    expect(
      button.bottom,
      `${button.label} should stay inside composer`,
    ).toBeLessThanOrEqual(geometry.composer.bottom + 1);
    for (const other of geometry.buttons.slice(index + 1)) {
      const overlapWidth =
        Math.min(button.right, other.right) - Math.max(button.x, other.x);
      const overlapHeight =
        Math.min(button.bottom, other.bottom) - Math.max(button.y, other.y);
      expect(
        overlapWidth <= 1 || overlapHeight <= 1,
        `${button.label} overlaps ${other.label}`,
      ).toBe(true);
    }
  }
}

async function expectApprovalGeometry(panel: Locator): Promise<void> {
  const section = panel.getByRole("region", {
    name: "Pending approvals for this session",
  });
  await expect(section).toBeVisible();
  const geometry = await section.evaluate((element) => {
    const panelElement = element.closest("[data-session-panel]");
    const list = element.querySelector<HTMLElement>(
      '[aria-label="Session approval requests"]',
    );
    const rect = (node: Element) => {
      const bounds = node.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        right: bounds.right,
        bottom: bounds.bottom,
        width: bounds.width,
        height: bounds.height,
      };
    };
    return {
      section: rect(element),
      panel: panelElement ? rect(panelElement) : null,
      list: list
        ? {
            ...rect(list),
            scrollHeight: list.scrollHeight,
            clientHeight: list.clientHeight,
          }
        : null,
      buttons: [...element.querySelectorAll("article button")].map((button) =>
        rect(button),
      ),
      messages: panelElement
        ? rect(panelElement.querySelector(".chat-messages") ?? panelElement)
        : null,
    };
  });
  expect(geometry.panel).not.toBeNull();
  const panelBounds = geometry.panel;
  if (!panelBounds) throw new Error("Approval panel geometry is unavailable.");
  expect(geometry.section.x).toBeGreaterThanOrEqual(panelBounds.x - 1);
  expect(geometry.section.right).toBeLessThanOrEqual(panelBounds.right + 1);
  expect(geometry.section.y).toBeGreaterThanOrEqual(panelBounds.y - 1);
  expect(geometry.section.bottom).toBeLessThanOrEqual(panelBounds.bottom + 1);
  expect(geometry.list).not.toBeNull();
  expect(geometry.buttons.length).toBeGreaterThan(0);

  for (const [index, button] of geometry.buttons.entries()) {
    expect(
      button.width,
      "approval decision target should be at least 44px wide",
    ).toBeGreaterThanOrEqual(44);
    expect(
      button.height,
      "approval decision target should be at least 44px tall",
    ).toBeGreaterThanOrEqual(44);
    expect(button.x).toBeGreaterThanOrEqual(geometry.section.x - 1);
    expect(button.right).toBeLessThanOrEqual(geometry.section.right + 1);
    for (const other of geometry.buttons.slice(index + 1)) {
      const overlapWidth =
        Math.min(button.right, other.right) - Math.max(button.x, other.x);
      const overlapHeight =
        Math.min(button.bottom, other.bottom) - Math.max(button.y, other.y);
      expect(
        overlapWidth <= 1 || overlapHeight <= 1,
        "approval decision targets should not overlap",
      ).toBe(true);
    }
  }

  if (geometry.messages) {
    expect(
      geometry.messages.height,
      "long approval details should leave conversation space visible",
    ).toBeGreaterThan(100);
  }
}

test.describe("Doolittle desktop session workbench", () => {
  test("fits the native terminal after mobile and narrow window resize", async () => {
    test.skip(
      process.platform !== "darwin",
      "Native Retina backing-store alignment is validated on macOS.",
    );
    test.setTimeout(90_000);
    mkdirSync(screenshotRoot, { recursive: true });
    const desktop = await launchIsolatedDesktop();
    try {
      const { app, page, pageErrors } = desktop;
      expect(app.windows().length).toBe(1);
      const nativeWindow = await app.browserWindow(page);
      await waitForDesktopReady(page);
      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      const codeView = page.locator(".view-code");
      await expect(codeView).toBeVisible();
      const utilityToggle = codeView.getByRole("button", {
        exact: true,
        name: "Utility",
      });
      if ((await utilityToggle.getAttribute("aria-pressed")) !== "true") {
        await utilityToggle.click();
      }
      const workspaceUtilities = page.getByRole("tablist", {
        name: "Workspace utilities",
      });
      await expect(workspaceUtilities).toBeVisible();
      await workspaceUtilities.getByRole("tab", { name: "Shell" }).click();
      await page.getByRole("button", { name: "Focus shared terminal" }).click();
      await expect(
        page.getByRole("tablist", { name: "Interactive terminal tabs" }),
      ).toBeVisible();
      const clearTerminal = page.getByRole("button", {
        name: "Clear terminal view",
      });
      await expect(clearTerminal).toBeEnabled({ timeout: 45_000 });

      const ownedWindowId = await nativeWindow.evaluate((window) => window.id);
      const displayScaleFactor = await app.evaluate(
        ({ BrowserWindow, screen }, id: number) => {
          const window = BrowserWindow.fromId(id);
          if (!window) throw new Error("Owned Electron window is missing.");
          return screen.getDisplayMatching(window.getBounds()).scaleFactor;
        },
        ownedWindowId,
      );
      test.skip(
        displayScaleFactor < 1.5,
        "Native device-pixel alignment requires a high-density display.",
      );

      const visibleTerminal = page.locator(".xterm").filter({ visible: true });
      await expect(visibleTerminal).toHaveCount(1);
      const resizeAndAssert = async (width: number, height: number) => {
        await nativeWindow.evaluate(
          (window, size: { width: number; height: number }) => {
            window.webContents.setZoomFactor(1);
            window.webContents.setZoomLevel(0);
            window.setContentSize(size.width, size.height);
          },
          { width, height },
        );
        await expect
          .poll(() => page.evaluate(() => [innerWidth, innerHeight]))
          .toEqual([width, height]);
        await expect
          .poll(
            () =>
              visibleTerminal.evaluate((element) => {
                const screen =
                  element.querySelector<HTMLElement>(".xterm-screen");
                if (!screen) return false;
                const terminalBounds = element.getBoundingClientRect();
                const screenBounds = screen.getBoundingClientRect();
                return (
                  screenBounds.width > 0 &&
                  terminalBounds.width - screenBounds.width <= 40 &&
                  screenBounds.left >= terminalBounds.left - 1 &&
                  screenBounds.right <= terminalBounds.right + 1
                );
              }),
            { timeout: 15_000 },
          )
          .toBe(true);
        await expect(clearTerminal).toBeEnabled();
        const metrics = await visibleTerminal.evaluate((element) => {
          const screen = element.querySelector<HTMLElement>(".xterm-screen");
          const canvas = element.querySelector<HTMLCanvasElement>("canvas");
          if (!screen || !canvas) return null;
          const terminalBounds = element.getBoundingClientRect();
          const screenBounds = screen.getBoundingClientRect();
          const canvasBounds = canvas.getBoundingClientRect();
          const style = getComputedStyle(element);
          const fontStack = getComputedStyle(document.documentElement)
            .getPropertyValue("--font-mono")
            .trim();
          const context = new OffscreenCanvas(100, 100).getContext("2d");
          const probeFont = `500 ${11.25 * devicePixelRatio}px ${fontStack || "monospace"}`;
          if (context) context.font = probeFont;
          return {
            terminalWidth: terminalBounds.width,
            screenWidth: screenBounds.width,
            screenRight: screenBounds.right,
            terminalRight: terminalBounds.right,
            dpr: devicePixelRatio,
            fontFamily: style.fontFamily,
            rootFontStack: fontStack,
            fontProbe: context
              ? {
                  accepted: context.font,
                  wWidth: context.measureText("W").width,
                }
              : null,
            canvasRatio:
              canvasBounds.width > 0
                ? canvas.width / canvasBounds.width
                : Number.NaN,
            canvasHeightRatio:
              canvasBounds.height > 0
                ? canvas.height / canvasBounds.height
                : Number.NaN,
          };
        });
        expect(metrics).not.toBeNull();
        if (!metrics)
          throw new Error("Native terminal metrics are unavailable.");
        expect(metrics.terminalWidth - metrics.screenWidth).toBeLessThanOrEqual(
          40,
        );
        expect(metrics.screenRight).toBeLessThanOrEqual(
          metrics.terminalRight + 1,
        );
        expect(metrics.dpr).toBeCloseTo(displayScaleFactor, 1);
        expect(metrics.fontFamily).not.toContain("var(");
        expect(metrics.rootFontStack).not.toContain("var(");
        expect(metrics.fontProbe?.accepted).toContain("SFMono-Regular");
        expect(metrics.fontProbe?.accepted).not.toContain("var(");
        expect(metrics.fontProbe?.wWidth ?? 0).toBeGreaterThan(0);
        expect(metrics.canvasRatio).toBeCloseTo(displayScaleFactor, 1);
        expect(metrics.canvasHeightRatio).toBeCloseTo(displayScaleFactor, 1);
        const target = width === 390 ? "mobile" : "narrow";
        await page.screenshot({
          animations: "disabled",
          fullPage: false,
          path: resolve(
            screenshotRoot,
            `13-terminal-native-${target}-${width}x${height}.png`,
          ),
          scale: "css",
        });
      };

      await resizeAndAssert(390, 844);
      await resizeAndAssert(760, 960);
      expect(pageErrors).toEqual([]);
    } finally {
      await desktop.dispose();
    }
  });

  test("opens, arranges, resizes, focuses, closes, and restores independent drafts", async () => {
    test.setTimeout(120_000);
    mkdirSync(screenshotRoot, { recursive: true });
    const desktop = await launchIsolatedDesktop();

    try {
      const { page, pageErrors } = desktop;
      await waitForDesktopReady(page);
      await page.setViewportSize({ width: 1440, height: 960 });
      await expectNoDesktopRecovery(page);

      const workbench = page.getByRole("region", {
        name: "Session workbench",
      });
      await expect(workbench).toContainText(/· \d+ running/, {
        timeout: 30_000,
      });
      const panels = workbench.locator("[data-session-panel]");
      await expect(workbench).toBeVisible();
      await expect(panels).toHaveCount(1);
      const firstId = await panels.first().getAttribute("data-session-panel");
      expect(firstId).toBeTruthy();
      const firstPanel = panelById(workbench, firstId as string);

      await firstPanel
        .getByRole("textbox", { name: "Message Doolittle" })
        .fill("Draft preserved in the first session.");
      await workbench
        .getByRole("button", { name: "New session", exact: true })
        .click();
      await expect(panels).toHaveCount(2);
      const panelIds = await panels.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-session-panel")),
      );
      const secondId = panelIds.find((id) => id && id !== firstId);
      expect(secondId).toBeTruthy();
      const secondPanel = panelById(workbench, secondId as string);
      await secondPanel
        .getByRole("textbox", { name: "Message Doolittle" })
        .fill("Draft preserved in the second session.");

      const contextToggle = page.getByRole("button", {
        name: "Context",
        exact: true,
      });
      await contextToggle.click();
      await expect(
        page.getByRole("button", { name: "Close thread context" }),
      ).toBeVisible();
      const contextTabs = page.getByRole("tablist", {
        name: "Thread context views",
      });
      await expect(page.locator(".thread-workbench")).toBeVisible();
      await expect(
        page.getByText("Files, changes, and run context"),
      ).toBeVisible();
      await expect(
        contextTabs.getByRole("tab", { name: "Files" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.locator(".thread-workbench .thread-workbench-file-empty"),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.locator(".thread-workbench").getByText("Loading workbench…"),
      ).toHaveCount(0);
      await expect(
        page.locator('.thread-workbench [data-thread-workbench="panel"]'),
      ).toBeVisible();
      await expect(
        secondPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeHidden();
      await expect(
        firstPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "03-context-tiled-1440.png"),
      });
      await contextTabs.getByRole("tab", { name: "Changes" }).click();
      await expect(
        contextTabs.getByRole("tab", { name: "Changes" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByText("No Git repository", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Working tree is clean", { exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "04-changes-tiled-1440.png"),
      });
      await firstPanel.locator("[data-session-focus]").click();
      await expect(contextToggle).toBeVisible();
      await contextToggle.click();
      await expect(page.locator("[data-thread-workbench=rail]")).toHaveCount(2);
      await expect(
        firstPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeHidden();
      await expect(
        secondPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeHidden();
      const contextRailLinks = await page
        .locator("[data-thread-workbench=rail]")
        .evaluateAll((rails) =>
          rails.map((rail) => {
            const tab = rail.querySelector<HTMLElement>(
              '[role="tab"][aria-selected="true"]',
            );
            const panel = rail.querySelector<HTMLElement>('[role="tabpanel"]');
            const controls = tab?.getAttribute("aria-controls") ?? "";
            return {
              tabId: tab?.id ?? "",
              panelId: panel?.id ?? "",
              controlsResolveToPanel:
                Boolean(controls) &&
                document.getElementById(controls) === panel,
              panelLabelsTab:
                panel?.getAttribute("aria-labelledby") === tab?.id,
            };
          }),
        );
      expect(contextRailLinks).toHaveLength(2);
      expect(contextRailLinks.every((link) => link.tabId && link.panelId)).toBe(
        true,
      );
      expect(new Set(contextRailLinks.map((link) => link.tabId)).size).toBe(2);
      expect(new Set(contextRailLinks.map((link) => link.panelId)).size).toBe(
        2,
      );
      expect(
        contextRailLinks.every(
          (link) => link.controlsResolveToPanel && link.panelLabelsTab,
        ),
      ).toBe(true);
      const rails = page.locator("[data-thread-workbench=rail]");
      while ((await rails.count()) > 0) {
        await rails
          .first()
          .getByRole("button", { name: "Close thread context" })
          .click();
      }
      await expect(rails).toHaveCount(0);
      await expect(
        firstPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeVisible();
      await expect(
        secondPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeVisible();
      await expect(contextToggle).toHaveAttribute("aria-expanded", "false");
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "01-chat-tiled-desktop.png"),
      });
      await page.setViewportSize({ width: 760, height: 960 });
      await contextToggle.click();
      await expect(
        page.getByRole("button", { name: "Close thread context" }),
      ).toBeVisible();
      await contextTabs.getByRole("tab", { name: "Files" }).click();
      await expect(
        contextTabs.getByRole("tab", { name: "Files" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.locator(".thread-workbench .thread-workbench-file-empty"),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.locator(".thread-workbench").getByText("Loading workbench…"),
      ).toHaveCount(0);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "05-context-in-narrow-tile-760.png"),
      });
      await page.getByRole("button", { name: "Close thread context" }).click();
      await expect(
        page.getByRole("button", { name: "Close thread context" }),
      ).toBeHidden();
      await expect(contextToggle).toBeFocused();
      await expect(contextToggle).toHaveAttribute("aria-expanded", "false");
      await contextToggle.click();
      const contextClose = page.getByRole("button", {
        name: "Close thread context",
      });
      await expect(contextClose).toBeVisible();
      await contextClose.focus();
      await page.keyboard.press("Enter");
      await expect(contextClose).toBeHidden();
      await expect(contextToggle).toBeFocused();
      await expect(contextToggle).toHaveAttribute("aria-expanded", "false");
      await page.setViewportSize({ width: 1440, height: 960 });

      const moveLeft = secondPanel.getByRole("button", {
        name: /^Move .* left$/,
      });
      await moveLeft.click();
      await expect
        .poll(() => panels.first().getAttribute("data-session-panel"))
        .toBe(secondId);

      const separator = workbench.getByRole("separator", {
        name: "Resize session panels",
      });
      const initialWeight = await separator.getAttribute("aria-valuenow");
      await separator.focus();
      await page.keyboard.press("ArrowRight");
      await expect
        .poll(() => separator.getAttribute("aria-valuenow"))
        .not.toBe(initialWeight);
      await page.keyboard.press("Home");
      await expect(separator).toHaveAttribute("aria-valuenow", "1");

      await workbench.getByRole("button", { name: "Focus panel" }).click();
      await expect(
        workbench.getByRole("button", { name: "Tile panels" }),
      ).toBeVisible();
      await expect(panelById(workbench, firstId as string)).toBeHidden();
      await expect(panelById(workbench, secondId as string)).toBeVisible();
      await workbench.getByRole("button", { name: "Tile panels" }).click();
      await expect(panelById(workbench, firstId as string)).toBeVisible();
      await expect(panelById(workbench, secondId as string)).toBeVisible();
      const resizerBox = await separator.boundingBox();
      expect(resizerBox).not.toBeNull();
      if (!resizerBox)
        throw new Error("Session panel resizer is not measurable.");
      await page.mouse.move(
        resizerBox.x + resizerBox.width / 2,
        resizerBox.y + resizerBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        resizerBox.x + resizerBox.width / 2 + 36,
        resizerBox.y + resizerBox.height / 2,
      );
      await page.mouse.up();
      await expect(separator).not.toHaveAttribute("aria-valuenow", "1");
      await expectComposerGeometry(panelById(workbench, firstId as string));
      await expectComposerGeometry(panelById(workbench, secondId as string));

      await secondPanel.getByRole("button", { name: /^Close / }).click();
      await expect(panelById(workbench, secondId as string)).toBeHidden();
      await workbench.getByRole("button", { name: "Find session" }).click();
      const finder = workbench.getByRole("region", { name: "Find a session" });
      const sessionSearch = finder.getByRole("textbox", {
        name: "Search loaded and local sessions",
      });
      await sessionSearch.fill(secondId as string);
      const results = finder.getByRole("list", {
        name: "Session search results",
      });
      await expect(results.getByRole("listitem")).toHaveCount(1);
      await results.getByRole("button").click();
      const restoredSecondPanel = panelById(workbench, secondId as string);
      await expect(restoredSecondPanel).toBeVisible();
      await expect(
        restoredSecondPanel.getByRole("textbox", {
          name: "Message Doolittle",
        }),
      ).toHaveValue("Draft preserved in the second session.");
      await expect(
        firstPanel.getByRole("textbox", { name: "Message Doolittle" }),
      ).toHaveValue("Draft preserved in the first session.");

      await workbench.getByRole("button", { name: "Find session" }).focus();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+Shift+O" : "Control+Shift+O",
      );
      await expect(finder).toBeVisible();
      await expect(sessionSearch).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(finder).toBeHidden();
      await expect(
        workbench.getByRole("button", { name: "Find session" }),
      ).toBeFocused();

      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "05-chat-tiled-after-reopen.png"),
      });

      await page.setViewportSize({ width: 390, height: 844 });
      const tabs = workbench.getByRole("tablist", { name: "Open sessions" });
      await expect(tabs).toBeVisible();
      await expect(tabs.getByRole("tab")).toHaveCount(2);
      const firstTab = tabs.getByRole("tab").first();
      await firstTab.focus();
      await page.keyboard.press("ArrowRight");
      await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(workbench.getByRole("tabpanel")).toHaveCount(1);
      await expectComposerGeometry(workbench.getByRole("tabpanel"));
      await contextToggle.click();
      await expect(
        page.getByRole("button", { name: "Close thread context" }),
      ).toBeVisible();
      const mobileWorkbench = page.getByRole("dialog", {
        name: "Thread workbench",
      });
      await expect
        .poll(() =>
          mobileWorkbench.evaluate((dialog) => {
            const rect = dialog.getBoundingClientRect();
            return {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
            };
          }),
        )
        .toEqual({
          x: 0,
          y: 0,
          width: 390,
          height: 844,
          viewportWidth: 390,
          viewportHeight: 844,
        });
      await expect(
        workbench.getByRole("tabpanel").getByRole("textbox", {
          name: "Message Doolittle",
        }),
      ).toBeHidden();
      const hiddenRailFocusables = await page
        .locator(".thread-workbench")
        .evaluate((rail) => {
          const focusables = rail.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          return [...focusables]
            .filter((element) => {
              const style = getComputedStyle(element);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                element.getClientRects().length > 0
              );
            })
            .filter((element) =>
              element.closest('[hidden], [inert], [aria-hidden="true"]'),
            )
            .map((element) => element.outerHTML);
        });
      expect(hiddenRailFocusables).toEqual([]);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "06-context-modal-390x844.png"),
      });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Close thread context" }),
      ).toBeHidden();
      await expect(contextToggle).toBeFocused();
      await expect(contextToggle).toHaveAttribute("aria-expanded", "false");
      const composerMetaToggle = workbench
        .getByRole("tabpanel")
        .locator(".chat-composer-meta-toggle");
      await expect(composerMetaToggle).toBeVisible();
      const composerMetaToggleBounds = await composerMetaToggle.boundingBox();
      expect(composerMetaToggleBounds).not.toBeNull();
      expect(composerMetaToggleBounds?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(composerMetaToggleBounds?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expect(
        composerMetaToggle.locator(".chat-composer-meta-toggle__label"),
      ).toBeHidden();
      const viewportGeometry = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }));
      expect(viewportGeometry.documentWidth).toBeLessThanOrEqual(
        viewportGeometry.viewportWidth + 1,
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "02-chat-tabbed-390x844.png"),
      });
      await expectNoDesktopRecovery(page);
      expect(pageErrors).toEqual([]);

      await page.evaluate(() => {
        window.location.hash = "#/settings";
      });
      await expect(page.locator(".view-settings")).toBeVisible();
      const lightAppearance = page.getByRole("button", {
        name: "Light: Light surfaces",
      });
      const darkAppearance = page.getByRole("button", {
        name: "Dark: Dark surfaces",
      });
      await lightAppearance.click();
      await expect(lightAppearance).toHaveAttribute("aria-pressed", "true");
      await expect(darkAppearance).toHaveAttribute("aria-pressed", "false");
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "05-settings-light.png"),
      });
      await darkAppearance.click();
      await expect(darkAppearance).toHaveAttribute("aria-pressed", "true");
      await expect(lightAppearance).toHaveAttribute("aria-pressed", "false");
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "06-settings-dark.png"),
      });
      const themesLoading = page.getByText("Loading runtime color themes…");
      const themeGrid = page.locator(".theme-grid");
      const themeError = page.locator(".view-settings [role=alert]");
      await expect
        .poll(
          async () => {
            const stillLoading = await themesLoading
              .isVisible()
              .catch(() => false);
            const loaded = await themeGrid
              .evaluate((grid) => !grid.hasAttribute("hidden"))
              .catch(() => false);
            const failed = await themeError.isVisible().catch(() => false);
            return !stillLoading && (loaded || failed);
          },
          { timeout: 15_000 },
        )
        .toBe(true);

      // Exercise the real terminal chrome without sending a shell command. The
      // isolated app owns the PTY and closes it when the app is disposed. This
      // stays independent of the approval IPC fixture.
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.evaluate(() => {
        window.location.hash = "#/code";
      });
      const codeView = page.locator(".view-code");
      await expect(codeView).toBeVisible();
      const workspaceUtilities = page.getByRole("tablist", {
        name: "Workspace utilities",
      });
      const utilityToggle = codeView.getByRole("button", {
        exact: true,
        name: "Utility",
      });
      if ((await utilityToggle.getAttribute("aria-pressed")) !== "true") {
        await utilityToggle.click();
      }
      await expect(workspaceUtilities).toBeVisible();
      await workspaceUtilities.getByRole("tab", { name: "Shell" }).click();
      await page.getByRole("button", { name: "Focus shared terminal" }).click();
      const terminalTabs = page.getByRole("tablist", {
        name: "Interactive terminal tabs",
      });
      await expect(terminalTabs).toBeVisible();
      const createTerminalTab = page.getByRole("button", {
        name: "Create terminal tab",
      });
      for (const expectedCount of [2, 3, 4]) {
        await createTerminalTab.click();
        await expect(terminalTabs.getByRole("tab")).toHaveCount(expectedCount);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(createTerminalTab).toBeVisible();
      await expect(createTerminalTab).toBeDisabled();
      const terminalMoreActions = page.getByLabel("More terminal actions");
      await expect(terminalMoreActions).toBeVisible();
      const narrowTerminalGeometry = await terminalTabs
        .locator("xpath=..")
        .evaluate((header) => {
          const rect = (element: Element) => {
            const bounds = element.getBoundingClientRect();
            return {
              x: bounds.x,
              y: bounds.y,
              right: bounds.right,
              bottom: bounds.bottom,
              width: bounds.width,
              height: bounds.height,
            };
          };
          const status = header.children.item(0);
          const actions = header.children.item(2);
          const tabs = header.querySelector('[role="tablist"]');
          const targets = [
            ...header.querySelectorAll<HTMLElement>(
              'button:not([hidden]), summary[aria-label="More terminal actions"]',
            ),
          ]
            .filter((element) => {
              const style = getComputedStyle(element);
              return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                element.getClientRects().length > 0
              );
            })
            .map((element) => ({
              label:
                element.getAttribute("aria-label") ??
                element.textContent?.trim(),
              ...rect(element),
            }));
          return {
            status: status ? rect(status) : null,
            actions: actions ? rect(actions) : null,
            tabs: tabs
              ? {
                  ...rect(tabs),
                  scrollWidth: (tabs as HTMLElement).scrollWidth,
                  clientWidth: (tabs as HTMLElement).clientWidth,
                }
              : null,
            targets,
          };
        });
      expect(narrowTerminalGeometry.status).not.toBeNull();
      expect(narrowTerminalGeometry.actions).not.toBeNull();
      expect(narrowTerminalGeometry.tabs).not.toBeNull();
      const statusBounds = narrowTerminalGeometry.status;
      const actionsBounds = narrowTerminalGeometry.actions;
      const tabsBounds = narrowTerminalGeometry.tabs;
      if (!statusBounds || !actionsBounds || !tabsBounds) {
        throw new Error("Narrow terminal chrome geometry is unavailable.");
      }
      expect(statusBounds.y).toBeLessThan(tabsBounds.y);
      expect(actionsBounds.y).toBeLessThan(tabsBounds.y);
      expect(statusBounds.bottom).toBeLessThanOrEqual(tabsBounds.y + 1);
      expect(actionsBounds.bottom).toBeLessThanOrEqual(tabsBounds.y + 1);
      expect(tabsBounds.scrollWidth).toBeGreaterThan(tabsBounds.clientWidth);
      for (const target of narrowTerminalGeometry.targets) {
        expect(
          target.width,
          `${target.label ?? "terminal control"} should be at least 44px wide`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          target.height,
          `${target.label ?? "terminal control"} should be at least 44px tall`,
        ).toBeGreaterThanOrEqual(44);
      }
      const lastTerminalTab = terminalTabs.getByRole("tab").last();
      const firstTerminalTab = terminalTabs.getByRole("tab").first();
      await firstTerminalTab.focus();
      await page.keyboard.press("Home");
      await expect(firstTerminalTab).toHaveAttribute("aria-selected", "true");
      await expect(firstTerminalTab).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(terminalTabs.getByRole("tab").nth(1)).toBeFocused();
      await expect(terminalTabs.getByRole("tab").nth(1)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await lastTerminalTab.focus();
      await expect(lastTerminalTab).toBeFocused();
      expect(
        await terminalTabs.evaluate((tabs) => (tabs as HTMLElement).scrollLeft),
      ).toBeGreaterThan(0);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "11-terminal-mobile-390x844.png"),
      });
      await page.setViewportSize({ width: 760, height: 960 });
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "12-terminal-narrow-pane-760.png"),
      });
      await terminalMoreActions.focus();
      await page.keyboard.press("Enter");
      await expect(terminalMoreActions.locator("xpath=..")).toHaveAttribute(
        "open",
        "",
      );
      const clearTerminalButtons = page.getByRole("button", {
        name: "Clear terminal view",
      });
      await expect(clearTerminalButtons).toHaveCount(2);
      await clearTerminalButtons.first().click();
      await expect(clearTerminalButtons.nth(0)).toBeDisabled();
      await expect(clearTerminalButtons.nth(1)).toBeDisabled();
      await expectNoDesktopRecovery(page);
      expect(pageErrors).toEqual([]);
    } finally {
      await desktop.dispose();
    }
  });

  test("keeps synthetic pending approvals session-scoped and reachable on narrow panels", async () => {
    test.setTimeout(120_000);
    mkdirSync(screenshotRoot, { recursive: true });
    const desktop = await launchIsolatedDesktop();

    try {
      const { app, page, pageErrors } = desktop;
      await waitForDesktopReady(page);
      await page.setViewportSize({ width: 1440, height: 960 });
      const workbench = page.getByRole("region", {
        name: "Session workbench",
      });
      await expect(workbench).toContainText(/· \d+ running/, {
        timeout: 30_000,
      });
      const panels = workbench.locator("[data-session-panel]");
      await expect(panels).toHaveCount(1);
      const firstId = await panels.first().getAttribute("data-session-panel");
      expect(firstId).toBeTruthy();
      await workbench
        .getByRole("button", { name: "New session", exact: true })
        .click();
      await expect(panels).toHaveCount(2);
      const ids = await panels.evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("data-session-panel"))
          .filter((id): id is string => Boolean(id)),
      );
      const secondId = ids.find((id) => id !== firstId);
      expect(secondId).toBeTruthy();
      const initialSessionIds = [
        firstId as string,
        secondId as string,
      ] as const;

      await installSyntheticApprovalFixture(app, initialSessionIds);
      // A reload clears the already-completed empty approval-resource cache so
      // the fixture's loading/error/retry path is exercised on first render.
      await page.reload();
      await expect(page).toHaveTitle(/Doolittle$/);
      const workbenchAfterReload = page.getByRole("region", {
        name: "Session workbench",
      });
      const reloadedPanels = workbenchAfterReload.locator(
        "[data-session-panel]",
      );
      await expect
        .poll(() => reloadedPanels.count(), { timeout: 30_000 })
        .toBeGreaterThanOrEqual(2);
      const reloadedIds = (
        await reloadedPanels.evaluateAll((elements) =>
          elements
            .map((element) => element.getAttribute("data-session-panel"))
            .filter((id): id is string => Boolean(id)),
        )
      ).slice(0, 2);
      const firstRestoredId = reloadedIds[0];
      const secondRestoredId = reloadedIds[1];
      if (!firstRestoredId || !secondRestoredId) {
        throw new Error(
          "Two restored session IDs are required for the fixture.",
        );
      }
      const sessionIds = [firstRestoredId, secondRestoredId] as const;
      await rebindSyntheticApprovalSessions(app, sessionIds);
      const extraIds = await reloadedPanels.evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("data-session-panel"))
          .filter((id): id is string => Boolean(id)),
      );
      for (const extraId of extraIds.slice(2)) {
        await panelById(workbenchAfterReload, extraId)
          .getByRole("button", { name: /^Close / })
          .click();
      }
      await expect(reloadedPanels.filter({ visible: true })).toHaveCount(2);

      const firstPanel = panelById(workbenchAfterReload, sessionIds[0]);
      const secondPanel = panelById(workbenchAfterReload, sessionIds[1]);
      const firstApprovalSection = firstPanel.getByRole("region", {
        name: "Pending approvals for this session",
      });
      await expect
        .poll(async () => (await syntheticApprovalFixtureState(app)).listCalls)
        .toBeGreaterThan(0);
      await expect(firstApprovalSection).toBeVisible();
      await expect(firstApprovalSection.getByRole("status")).toContainText(
        "Checking approvals for this session",
      );
      await expect(firstApprovalSection).toHaveAttribute("aria-busy", "true");
      await waitForDesktopReady(page);
      await expect(firstApprovalSection.getByRole("alert")).toContainText(
        "temporary list failure",
        { timeout: 15_000 },
      );
      await releaseSyntheticApprovalListFailure(app);
      const retry = firstApprovalSection.getByRole("button", {
        name: "Retry approvals",
      });
      await retry.focus();
      await expect(retry).toBeFocused();
      const retryListCalls = (await syntheticApprovalFixtureState(app))
        .listCalls;
      await page.keyboard.press("Enter");
      await expect
        .poll(async () => (await syntheticApprovalFixtureState(app)).listCalls)
        .toBeGreaterThan(retryListCalls);

      const firstRequests = firstApprovalSection.getByRole("region", {
        name: "Session approval requests",
      });
      const secondApprovalSection = secondPanel.getByRole("region", {
        name: "Pending approvals for this session",
      });
      const secondRequests = secondApprovalSection.getByRole("region", {
        name: "Session approval requests",
      });
      await expect(firstApprovalSection).toHaveAttribute("aria-busy", "false");
      await expect(firstRequests.getByRole("article")).toHaveCount(3);
      await expect(secondRequests.getByRole("article")).toHaveCount(1);
      await expect(firstApprovalSection).toContainText(
        "3 pending requests for this session.",
      );
      await expect(firstApprovalSection).not.toContainText(
        "fixture inspect session B",
      );
      await expect(firstApprovalSection).not.toContainText(
        "fixture review unattributed request",
      );
      await expect(secondApprovalSection).toContainText(
        "fixture inspect session B",
      );
      await expect(secondApprovalSection).not.toContainText(
        "fixture inspect session A",
      );
      await expect(secondApprovalSection).not.toContainText(
        "fixture review unattributed request",
      );
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "07-approvals-tiled-1440.png"),
      });

      await page.setViewportSize({ width: 1024, height: 960 });
      const masthead = page.locator(".chat-header-top-actions");
      await expect(masthead).toBeVisible();
      const mastheadGeometry = await masthead.evaluate((container) => {
        const bounds = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return {
            label:
              element.getAttribute("aria-label") ??
              element.textContent?.trim().replace(/\s+/gu, " ") ??
              element.tagName.toLowerCase(),
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
          };
        };
        const containerBounds = container.getBoundingClientRect();
        const visibleChildren = Array.from(container.children)
          .filter((element) => {
            const style = getComputedStyle(element);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              element.getClientRects().length > 0
            );
          })
          .map(bounds);
        const overlaps = visibleChildren.flatMap((left, index) =>
          visibleChildren
            .slice(index + 1)
            .flatMap((right) =>
              left.x < right.right - 1 &&
              right.x < left.right - 1 &&
              left.y < right.bottom - 1 &&
              right.y < left.bottom - 1
                ? [`${left.label} overlaps ${right.label}`]
                : [],
            ),
        );
        const outOfBounds = visibleChildren
          .filter(
            (child) =>
              child.x < containerBounds.left - 1 ||
              child.right > containerBounds.right + 1,
          )
          .map((child) => child.label);
        return { visibleChildren, overlaps, outOfBounds };
      });
      expect(mastheadGeometry.visibleChildren.length).toBeGreaterThan(0);
      expect(mastheadGeometry.overlaps).toEqual([]);
      expect(mastheadGeometry.outOfBounds).toEqual([]);
      await expect(firstPanel).toBeVisible();
      await expect(secondPanel).toBeVisible();
      await expectApprovalGeometry(firstPanel);
      await expectApprovalGeometry(secondPanel);
      const firstTileWidth = await firstPanel.evaluate(
        (panel) => panel.getBoundingClientRect().width,
      );
      const secondTileWidth = await secondPanel.evaluate(
        (panel) => panel.getBoundingClientRect().width,
      );
      expect(firstTileWidth).toBeGreaterThanOrEqual(360);
      expect(secondTileWidth).toBeGreaterThanOrEqual(360);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "08-approvals-tiled-1024.png"),
      });
      await expect
        .poll(() =>
          firstRequests.evaluate(
            (list) => list.scrollHeight > list.clientHeight,
          ),
        )
        .toBe(true);
      await firstRequests.focus();
      await expect(firstRequests).toBeFocused();
      await page.keyboard.press("End");
      await expect
        .poll(() =>
          firstRequests.evaluate(
            (list) =>
              list.scrollTop + list.clientHeight >= list.scrollHeight - 1,
          ),
        )
        .toBe(true);
      await firstRequests.hover();
      await page.mouse.wheel(0, 1_200);
      const longCopyAction = firstRequests
        .locator("article")
        .filter({ hasText: "inspect-a-long-protected-target" })
        .getByRole("button", { name: "Approve" });
      const longActionGeometry = await longCopyAction.evaluate((button) => {
        const list = button.closest('[aria-label="Session approval requests"]');
        const buttonRect = button.getBoundingClientRect();
        const listRect = list?.getBoundingClientRect();
        return {
          visibleWithinList: Boolean(
            listRect &&
              buttonRect.top >= listRect.top - 1 &&
              buttonRect.bottom <= listRect.bottom + 1,
          ),
          listAtEnd: Boolean(
            list && list.scrollTop + list.clientHeight >= list.scrollHeight - 1,
          ),
        };
      });
      expect(longActionGeometry).toEqual({
        visibleWithinList: true,
        listAtEnd: true,
      });
      await page.setViewportSize({ width: 760, height: 960 });
      const desktopNarrowSessionTabs = workbenchAfterReload.getByRole(
        "tablist",
        { name: "Open sessions" },
      );
      await expect(desktopNarrowSessionTabs.getByRole("tab")).toHaveCount(2);
      await desktopNarrowSessionTabs.getByRole("tab").nth(0).click();
      await expect(firstPanel).toBeVisible();
      await expect(secondPanel).toBeHidden();
      await expectApprovalGeometry(firstPanel);
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "09-approvals-tabbed-760.png"),
      });

      await page.setViewportSize({ width: 390, height: 844 });
      const sessionTabs = workbenchAfterReload.getByRole("tablist", {
        name: "Open sessions",
      });
      await expect(sessionTabs.getByRole("tab")).toHaveCount(2);
      await sessionTabs.getByRole("tab").nth(0).click();
      await expect(firstPanel).toBeVisible();
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(
          screenshotRoot,
          "10-approvals-mobile-390x844-diagnostic.png",
        ),
      });
      await expectComposerGeometry(firstPanel);
      const mobileConversation = await firstPanel
        .locator(".chat-messages")
        .boundingBox();
      expect(mobileConversation).not.toBeNull();
      if (!mobileConversation)
        throw new Error("390px conversation geometry is unavailable.");
      expect(
        mobileConversation.height,
        "conversation space should remain visible beside the compact approval trigger",
      ).toBeGreaterThan(100);
      const mobileWidth = await firstPanel.evaluate(
        (panel) => panel.getBoundingClientRect().width,
      );
      expect(mobileWidth).toBeLessThanOrEqual(390);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth + 1,
          ),
        )
        .toBe(true);
      const firstReviewTrigger = firstPanel.getByRole("button", {
        name: /^Review session approvals/,
      });
      await expect(firstReviewTrigger).toBeVisible();
      await expect(firstReviewTrigger).toHaveCSS("min-height", "44px");
      await firstReviewTrigger.click();
      const firstApprovalDialog = page.getByRole("dialog", {
        name: "Review session approvals",
      });
      await expect(firstApprovalDialog).toBeVisible();
      const mobileApprovalSection = firstApprovalDialog.getByRole("region", {
        name: "Pending approvals for this session",
      });
      const mobileRequests = mobileApprovalSection.getByRole("region", {
        name: "Session approval requests",
      });
      await expect(mobileRequests.getByRole("article")).toHaveCount(3);
      const mobileApprovalGeometry = await firstApprovalDialog.evaluate(
        (dialog) => {
          const section = dialog.querySelector<HTMLElement>(
            '[aria-label="Pending approvals for this session"]',
          );
          const list = dialog.querySelector<HTMLElement>(
            '[aria-label="Session approval requests"]',
          );
          const rect = (element: Element) => {
            const bounds = element.getBoundingClientRect();
            return {
              x: bounds.x,
              y: bounds.y,
              right: bounds.right,
              bottom: bounds.bottom,
              width: bounds.width,
              height: bounds.height,
            };
          };
          return {
            dialog: rect(dialog),
            viewport: { width: innerWidth, height: innerHeight },
            section: section ? rect(section) : null,
            list: list
              ? {
                  ...rect(list),
                  scrollHeight: list.scrollHeight,
                  clientHeight: list.clientHeight,
                }
              : null,
            buttons: [
              ...(section?.querySelectorAll("article button") ?? []),
            ].map(rect),
          };
        },
      );
      expect(mobileApprovalGeometry.section).not.toBeNull();
      expect(mobileApprovalGeometry.list).not.toBeNull();
      expect(mobileApprovalGeometry.dialog).not.toBeNull();
      expect(mobileApprovalGeometry.buttons.length).toBeGreaterThan(0);
      if (
        !mobileApprovalGeometry.dialog ||
        !mobileApprovalGeometry.section ||
        !mobileApprovalGeometry.list
      ) {
        throw new Error("Mobile approval dialog geometry is unavailable.");
      }
      expect(mobileApprovalGeometry.dialog.x).toBeGreaterThanOrEqual(-1);
      expect(mobileApprovalGeometry.dialog.right).toBeLessThanOrEqual(
        mobileApprovalGeometry.viewport.width + 1,
      );
      expect(mobileApprovalGeometry.dialog.y).toBeGreaterThanOrEqual(-1);
      expect(mobileApprovalGeometry.dialog.bottom).toBeLessThanOrEqual(
        mobileApprovalGeometry.viewport.height + 1,
      );
      expect(mobileApprovalGeometry.section.x).toBeGreaterThanOrEqual(
        mobileApprovalGeometry.dialog.x - 1,
      );
      expect(mobileApprovalGeometry.section.right).toBeLessThanOrEqual(
        mobileApprovalGeometry.dialog.right + 1,
      );
      expect(mobileApprovalGeometry.section.y).toBeGreaterThanOrEqual(
        mobileApprovalGeometry.dialog.y - 1,
      );
      expect(mobileApprovalGeometry.section.bottom).toBeLessThanOrEqual(
        mobileApprovalGeometry.dialog.bottom + 1,
      );
      expect(mobileApprovalGeometry.list.scrollHeight).toBeGreaterThan(
        mobileApprovalGeometry.list.clientHeight,
      );
      for (const [index, button] of mobileApprovalGeometry.buttons.entries()) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.x).toBeGreaterThanOrEqual(
          mobileApprovalGeometry.section.x - 1,
        );
        expect(button.right).toBeLessThanOrEqual(
          mobileApprovalGeometry.section.right + 1,
        );
        for (const other of mobileApprovalGeometry.buttons.slice(index + 1)) {
          const overlapWidth =
            Math.min(button.right, other.right) - Math.max(button.x, other.x);
          const overlapHeight =
            Math.min(button.bottom, other.bottom) - Math.max(button.y, other.y);
          expect(
            overlapWidth <= 1 || overlapHeight <= 1,
            "mobile dialog decision targets should not overlap",
          ).toBe(true);
        }
      }
      await page.screenshot({
        animations: "disabled",
        fullPage: true,
        path: resolve(screenshotRoot, "10-approvals-mobile-390x844.png"),
      });
      const longCopyArticle = mobileRequests
        .locator("article")
        .filter({ hasText: "inspect-a-long-protected-target" });
      const longCopyApprove = longCopyArticle.getByRole("button", {
        name: "Approve",
      });
      const longCopyDecision = longCopyArticle.getByRole("button").first();
      const longCopyTextGeometry = await longCopyApprove
        .locator("xpath=ancestor::article")
        .evaluate((article) =>
          [...article.querySelectorAll("code, p")].map((copy) => ({
            textLength: copy.textContent?.length ?? 0,
            clientWidth: copy.clientWidth,
            scrollWidth: copy.scrollWidth,
            whiteSpace: getComputedStyle(copy).whiteSpace,
            overflowWrap: getComputedStyle(copy).overflowWrap,
          })),
        );
      expect(longCopyTextGeometry.length).toBeGreaterThanOrEqual(2);
      for (const copy of longCopyTextGeometry) {
        expect(copy.textLength).toBeGreaterThan(0);
        expect(copy.scrollWidth).toBeLessThanOrEqual(copy.clientWidth + 1);
        expect(copy.overflowWrap).toBe("anywhere");
      }
      await mobileRequests.focus();
      await expect(mobileRequests).toBeFocused();
      await page.keyboard.press("End");
      await expect
        .poll(() =>
          mobileRequests.evaluate(
            (list) =>
              list.scrollTop + list.clientHeight >= list.scrollHeight - 1,
          ),
        )
        .toBe(true);
      await mobileRequests.focus();
      for (let step = 0; step < 5; step += 1) {
        await page.keyboard.press("Tab");
      }
      await expect(longCopyApprove).toBeFocused();
      const mobileActionGeometry = await longCopyApprove.evaluate((button) => {
        const list = button.closest('[aria-label="Session approval requests"]');
        const buttonRect = button.getBoundingClientRect();
        const listRect = list?.getBoundingClientRect();
        return Boolean(
          listRect &&
            buttonRect.top >= listRect.top - 1 &&
            buttonRect.bottom <= listRect.bottom + 1,
        );
      });
      expect(mobileActionGeometry).toBe(true);
      await expect(longCopyDecision).toHaveText("Approve");
      await page.keyboard.press("Enter");
      await expect(longCopyDecision).toBeDisabled();
      await expect(longCopyDecision).toContainText("Working…");
      await expect(mobileApprovalSection).toHaveAttribute("aria-busy", "true");
      await expect(
        mobileApprovalSection
          .getByRole("status")
          .filter({ hasText: "Approved." }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(longCopyApprove).toHaveCount(0);
      await expect
        .poll(async () => (await syntheticApprovalFixtureState(app)).decisions)
        .toContainEqual({
          id: "approval-session-a-long-copy",
          decision: "approve",
        });
      await page.keyboard.press("Escape");
      await expect(firstApprovalDialog).toBeHidden();
      await expect(firstReviewTrigger).toBeFocused();

      await sessionTabs.getByRole("tab").nth(1).click();
      const secondReviewTrigger = secondPanel.getByRole("button", {
        name: /^Review session approvals/,
      });
      await expect(secondReviewTrigger).toBeVisible();
      await secondReviewTrigger.click();
      const secondApprovalDialog = page.getByRole("dialog", {
        name: "Review session approvals",
      });
      await expect(secondApprovalDialog).toBeVisible();
      const mobileSecondApprovalSection = secondApprovalDialog.getByRole(
        "region",
        { name: "Pending approvals for this session" },
      );
      const mobileSecondRequests = mobileSecondApprovalSection.getByRole(
        "region",
        { name: "Session approval requests" },
      );
      const denyButton = mobileSecondApprovalSection.getByRole("button", {
        name: "Deny",
      });
      const denyDecision = mobileSecondRequests.getByRole("button").last();
      await expect(denyDecision).toHaveText("Deny");
      await denyButton.click();
      await expect(denyDecision).toBeDisabled();
      await expect(mobileSecondApprovalSection).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(
        mobileSecondApprovalSection.getByRole("status"),
      ).toContainText("Denied this request.", { timeout: 15_000 });
      await expect(mobileSecondRequests.getByRole("article")).toHaveCount(0);
      await secondApprovalDialog
        .getByRole("button", {
          name: "Close approvals",
        })
        .click();
      await expect(secondReviewTrigger).toBeFocused();

      await sessionTabs.getByRole("tab").nth(0).click();
      await firstReviewTrigger.click();
      const firstAction = mobileRequests
        .locator("article")
        .filter({ hasText: "fixture inspect session A" })
        .getByRole("button", { name: "Approve" });
      const firstDecision = mobileRequests
        .locator("article")
        .filter({ hasText: "fixture inspect session A" })
        .getByRole("button")
        .first();
      await mobileRequests.focus();
      await page.keyboard.press("Home");
      await expect(firstDecision).toHaveText("Approve");
      await firstAction.click();
      await expect(firstDecision).toBeDisabled();
      await expect(firstDecision).toContainText("Working…");
      await expect(mobileApprovalSection).toHaveAttribute("aria-busy", "true");
      await expect(mobileApprovalSection.getByRole("status")).toContainText(
        "Approved.",
        { timeout: 15_000 },
      );
      const fixtureState = await syntheticApprovalFixtureState(app);
      expect(fixtureState.decisions).toEqual([
        { id: "approval-session-a-long-copy", decision: "approve" },
        { id: "approval-session-b", decision: "deny" },
        { id: "approval-session-a", decision: "approve" },
      ]);

      await page.evaluate(() => {
        window.location.hash = "#/review";
      });
      const reviewPage = page.locator(".review-page");
      await expect(reviewPage).toBeVisible();
      const unknownApproval = reviewPage
        .locator('[data-review="queue"]')
        .getByRole("button")
        .filter({ hasText: "fixture review unattributed request" });
      await expect(unknownApproval).toBeVisible();
      await expect(unknownApproval).toContainText("pending");
      await expectNoDesktopRecovery(page);
      expect(pageErrors).toEqual([]);
    } finally {
      await desktop.dispose();
    }
  });

  test("keeps running, approval, cancellation, failure, and completion state bound to each session", async () => {
    test.setTimeout(120_000);
    const desktop = await launchIsolatedDesktop();

    try {
      const { app, page, pageErrors } = desktop;
      await waitForDesktopReady(page);
      await page.setViewportSize({ width: 1440, height: 960 });
      await installSyntheticChatLifecycleFixture(app);

      const workbench = page.getByRole("region", {
        name: "Session workbench",
      });
      await expect(workbench).toContainText(/· \d+ running/, {
        timeout: 30_000,
      });
      const panels = workbench.locator("[data-session-panel]");
      await expect(panels).toHaveCount(1);
      const firstId = await panels.first().getAttribute("data-session-panel");
      expect(firstId).toBeTruthy();
      const firstPanel = panelById(workbench, firstId as string);

      async function startFixture(
        panel: ReturnType<typeof panelById>,
        mode: "running" | "waiting" | "failed" | "complete",
      ) {
        const composer = panel.getByRole("textbox", {
          name: "Message Doolittle",
        });
        await composer.fill(syntheticChatPrompt(mode));
        await composer.press("Enter");
        const userMessage = panel
          .locator(".chat-message.user")
          .filter({ hasText: syntheticChatPrompt(mode) });
        await expect(userMessage).toBeVisible();
      }

      await startFixture(firstPanel, "running");
      const firstReceipt = firstPanel.locator(".chat-run-receipt").last();
      await expect(firstReceipt).toContainText("Working");
      await expect(
        firstPanel.locator(".chat-message.assistant").last(),
      ).toContainText(
        "Synthetic E2E renderer fixture only; this is not a model response.",
      );

      await workbench
        .getByRole("button", { name: "New session", exact: true })
        .click();
      await expect(panels).toHaveCount(2);
      const secondId = (
        await panels.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-session-panel")),
        )
      ).find((id) => id && id !== firstId);
      expect(secondId).toBeTruthy();
      const secondPanel = panelById(workbench, secondId as string);
      await startFixture(secondPanel, "waiting");
      const secondReceipt = secondPanel.locator(".chat-run-receipt").last();
      await expect(secondReceipt).toContainText("Approval needed");
      await expect(firstReceipt).toContainText("Working");

      await firstPanel.getByRole("button", { name: "Stop response" }).click();
      await expect(
        firstPanel.locator(".chat-run-receipt").last(),
      ).toContainText("Run cancelled");
      await expect(secondReceipt).toContainText("Approval needed");

      await secondPanel.getByRole("button", { name: "Stop response" }).click();
      await expect(
        secondPanel.locator(".chat-run-receipt").last(),
      ).toContainText("Run cancelled");
      await startFixture(firstPanel, "failed");
      await expect(
        firstPanel.locator(".chat-run-receipt").last(),
      ).toContainText("Run failed");

      await startFixture(secondPanel, "complete");
      await expect(
        secondPanel.locator(".chat-message.assistant").last(),
      ).toContainText(
        "Synthetic E2E renderer fixture only; this is not a model response.",
      );
      await expect(
        secondPanel.locator(".chat-run-receipt").last(),
      ).toContainText("Run complete");
      await expectNoDesktopRecovery(page);
      expect(pageErrors).toEqual([]);
    } finally {
      await desktop.dispose();
    }
  });

  test("bounds closed panel mounts and recovers an evicted unsent draft", async () => {
    test.setTimeout(120_000);
    const desktop = await launchIsolatedDesktop();

    try {
      const { page, pageErrors } = desktop;
      await waitForDesktopReady(page);
      await page.setViewportSize({ width: 1440, height: 960 });
      const workbench = page.getByRole("region", {
        name: "Session workbench",
      });
      await expect(workbench).toContainText(/· \d+ running/, {
        timeout: 30_000,
      });
      const panels = workbench.locator("[data-session-panel]");
      await expect(panels).toHaveCount(1);
      const originalId = await panels
        .first()
        .getAttribute("data-session-panel");
      expect(originalId).toBeTruthy();
      const originalDraft = "Keep this unsent draft across many closed panels.";
      await panelById(workbench, originalId as string)
        .getByRole("textbox", { name: "Message Doolittle" })
        .fill(originalDraft);
      await panelById(workbench, originalId as string)
        .getByRole("button", { name: /^Close / })
        .click();
      await expect(panelById(workbench, originalId as string)).toBeHidden();

      for (let index = 0; index < 30; index += 1) {
        const before = new Set(
          (
            await panels.evaluateAll((elements) =>
              elements.map((element) =>
                element.getAttribute("data-session-panel"),
              ),
            )
          ).filter((id): id is string => Boolean(id)),
        );
        await workbench
          .getByRole("button", { name: "New session", exact: true })
          .click();
        await expect
          .poll(async () =>
            (
              await panels.evaluateAll((elements) =>
                elements.map((element) =>
                  element.getAttribute("data-session-panel"),
                ),
              )
            ).some((id) => id && !before.has(id)),
          )
          .toBe(true);
        const currentIds = await panels.evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("data-session-panel")),
        );
        const newId = currentIds.find((id) => id && !before.has(id));
        expect(newId).toBeTruthy();
        const newPanel = panelById(workbench, newId as string);
        await expect(newPanel).toBeVisible();
        await newPanel.getByRole("button", { name: /^Close / }).click();
        await expect(newPanel).toBeHidden();
        expect(
          await panels.count(),
          `mounted session panels after cycle ${index + 1}`,
        ).toBeLessThanOrEqual(24);
      }

      const finder = workbench.getByRole("button", { name: "Find session" });
      await finder.click();
      const search = workbench.getByRole("textbox", {
        name: "Search loaded and local sessions",
      });
      await search.fill(originalId as string);
      const results = workbench.getByRole("list", {
        name: "Session search results",
      });
      await expect(results.getByRole("listitem")).toHaveCount(1);
      await results.getByRole("button").click();
      const recovered = panelById(workbench, originalId as string);
      await expect(recovered).toBeVisible();
      await expect(
        recovered.getByRole("textbox", { name: "Message Doolittle" }),
      ).toHaveValue(originalDraft);
      expect(await panels.count()).toBeLessThanOrEqual(24);
      await expectNoDesktopRecovery(page);
      expect(pageErrors).toEqual([]);
    } finally {
      await desktop.dispose();
    }
  });
});
