import { expect, test } from "@playwright/test";
import { launchDesktop } from "../support/desktop-core";

const executable = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
if (!executable)
  throw new Error("Use the provenance-checking packaged test runner.");

test.describe("packaged desktop smoke", () => {
  test("boots preload, runs private scratch terminal and completes offline chat", async () => {
    test.setTimeout(150_000);
    const desktop = await launchDesktop(executable);
    try {
      const page = desktop.page;
      await expect
        .poll(() => page.evaluate(() => typeof window.doolittle))
        .toBe("object");
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await expect(composer).toBeEnabled();
      await composer.focus();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      const terminal = page.getByLabel("Chat terminal panel");
      await expect(terminal).toBeVisible();
      await expect(
        terminal.getByRole("button", { name: "Interrupt foreground process" }),
      ).toBeVisible({ timeout: 25_000 });
      await expect(
        terminal.locator(".interactive-terminal-mode"),
      ).toContainText("PTY");
      await terminal.getByRole("tabpanel").click();
      await page.keyboard.type("printf 'FRESH_%s\\n' TERMINAL");
      await page.keyboard.press("Enter");
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              for (let index = 0; index < localStorage.length; index++) {
                const key = localStorage.key(index);
                if (
                  !key?.startsWith("doolittle.desktop.interactive-terminal.v3:")
                )
                  continue;
                const value = localStorage.getItem(key);
                if (value?.includes("FRESH_TERMINAL")) return true;
              }
              return false;
            }),
          { timeout: 20_000 },
        )
        .toBe(true);
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      await expect(terminal).toBeHidden();
      await expect(composer).toBeFocused();
      await composer.fill("Fresh packaged offline hello");
      await composer.press("Enter");
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText("Fresh packaged offline hello"),
      ).toBeVisible();
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText("model provider is unavailable", { exact: false }),
      ).toBeVisible({ timeout: 60_000 });
    } finally {
      await desktop.dispose();
    }
  });
});
