import { expect, test } from "@playwright/test";
import {
  desktopHashForView,
  type View,
} from "../../apps/desktop/src/renderer/desktop-navigation";
import { launchDesktop } from "../support/desktop-core";

const routes = [
  ["dashboard", "[data-dashboard-page]"],
  ["activity", "[data-activity-page]"],
  ["analytics", "[data-analytics-page]"],
  ["code", ".coding-workspace-page"],
  ["review", ".orchestration-page"],
  ["gateway", ".orchestration-page"],
  ["settings", ".page-settings"],
  ["connections", ".page-settings"],
] as const satisfies ReadonlyArray<readonly [View, string]>;

test("desktop pages fill their workbench while Chat keeps its gutter", async () => {
  const desktop = await launchDesktop();
  const { app, page } = desktop;
  try {
    for (const width of [1320, 520]) {
      await app.evaluate(({ BrowserWindow }, width) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(width, 790);
      }, width);
      await expect
        .poll(() => page.evaluate(() => window.innerWidth))
        .toBe(width);

      for (const [view, selector] of routes) {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, desktopHashForView(view));
        const frame = page.locator(`[data-view="${view}"]`);
        const surface = frame.locator(selector).first();
        await expect(surface).toBeVisible();
        await expect
          .poll(
            () =>
              surface.evaluate((element) => {
                const viewport = element.closest("[data-view]");
                if (!viewport) return null;
                const container = viewport.getBoundingClientRect();
                const content = element.getBoundingClientRect();
                return [
                  Math.round(content.x - container.x),
                  Math.round(content.y - container.y),
                  Math.round(content.width - viewport.clientWidth),
                ];
              }),
            { message: `${view} at ${width}px` },
          )
          .toEqual([0, 0, 0]);
        expect(
          await surface.evaluate(
            (element) => getComputedStyle(element).padding,
          ),
        ).toBe("0px");
      }

      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, desktopHashForView("chat"));
      const chat = page.locator('[data-view="chat"]');
      const composer = chat.getByRole("combobox", { name: /^Message /u });
      await expect(composer).toBeVisible();
      const container = await chat.boundingBox();
      const input = await composer.boundingBox();
      expect(
        container && input ? container.width - input.width : 0,
      ).toBeGreaterThan(12);
    }
  } finally {
    await desktop.dispose();
  }
});
