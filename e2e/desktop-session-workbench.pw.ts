import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import { expectNoDesktopRecovery } from "./support/desktop-assertions";
import {
  launchIsolatedDesktop,
  waitForDesktopReady,
} from "./support/doolittle-workbench-app";
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
  expect(textarea.x).toBeGreaterThanOrEqual(geometry.composer.x - 1);
  expect(textarea.right).toBeLessThanOrEqual(geometry.composer.right + 1);

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

test.describe("Doolittle desktop session workbench", () => {
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
      const composerLabelGeometry = await workbench
        .getByRole("tabpanel")
        .evaluate((panel) => {
          const button = panel.querySelector(".chat-composer-meta-toggle");
          const label = button?.querySelector(
            ".chat-composer-meta-toggle__label",
          );
          const inspect = (element: Element | null | undefined) => {
            if (!element) return null;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return {
              position: style.position,
              width: style.width,
              height: style.height,
              overflow: style.overflow,
              clipPath: style.clipPath,
              whiteSpace: style.whiteSpace,
              display: style.display,
              x: rect.x,
              y: rect.y,
              right: rect.right,
              bottom: rect.bottom,
            };
          };
          return {
            button: inspect(button),
            label: inspect(label),
            routing: inspect(panel.querySelector(".chat-composer-routing")),
          };
        });
      console.log(
        `Narrow composer label geometry: ${JSON.stringify(composerLabelGeometry)}`,
      );
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
      await page.waitForTimeout(2_000);
      const themesLoading = await page
        .getByText("Loading runtime color themes…")
        .isVisible()
        .catch(() => false);
      if (themesLoading) {
        const themeResponse = await page.evaluate(async () => {
          const startedAt = performance.now();
          try {
            const response = await window.doolittle.requestAgent({
              requestId: crypto.randomUUID(),
              path: "/theme",
              method: "GET",
              headers: {},
            });
            const payload = JSON.parse(response.body) as Record<
              string,
              unknown
            >;
            return {
              status: response.status,
              durationMs: Math.round(performance.now() - startedAt),
              keys: Object.keys(payload),
              themesCount: Array.isArray(payload.themes)
                ? payload.themes.length
                : null,
            };
          } catch (error) {
            return {
              durationMs: Math.round(performance.now() - startedAt),
              error: error instanceof Error ? error.message : "unknown error",
            };
          }
        });
        console.log(
          `Read-only /theme transport probe: ${JSON.stringify(themeResponse)}`,
        );
      }
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
