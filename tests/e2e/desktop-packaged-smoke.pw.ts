import { expect, test } from "@playwright/test";
import { agentRequest, launchDesktop } from "../support/desktop-core";

const executable = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
if (!executable)
  throw new Error("Use the provenance-checking packaged test runner.");

test.describe("packaged desktop smoke", () => {
  test("boots, runs a private terminal, and retains offline chat across restart", async () => {
    test.setTimeout(150_000);
    const desktop = await launchDesktop(executable);
    try {
      const page = desktop.page;
      await expect
        .poll(() => page.evaluate(() => typeof window.doolittle))
        .toBe("object");
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      const composer = page.getByRole("combobox", {
        name: "Message Doolittle",
      });
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
      await page.keyboard.type(
        "test -z \"$ELECTRON_RUN_AS_NODE\" && printf 'FRESH_%s\\n' TERMINAL",
      );
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

      const processId = desktop.app.process().pid;
      const agentId = await page.evaluate(
        async () => (await window.doolittle.getBackendState()).agentId,
      );
      expect(agentId).toEqual(expect.any(String));
      const historyPath = "/sessions/search?query=Fresh+packaged+offline+hello";
      const history = await agentRequest<{ hits: unknown[] }>(
        page,
        historyPath,
      );
      expect(history.hits.length).toBeGreaterThan(0);

      const child = desktop.app.process();
      let shutdownWarning = false;
      const recordWarning = (chunk: Buffer) => {
        if (chunk.includes("Doolittle could not quit safely"))
          shutdownWarning = true;
      };
      child.stderr?.on("data", recordWarning);
      try {
        await desktop.app.evaluate(({ BrowserWindow, dialog }) => {
          const window = BrowserWindow.getAllWindows().find((candidate) =>
            candidate.isVisible(),
          );
          if (!window) throw new Error("Expected the main window to be open");
          dialog.showErrorBox = (title) => {
            process.stderr.write(`${title}\n`);
          };
          setImmediate(() => window.close());
        });
        await expect
          .poll(() => (shutdownWarning ? "shutdown warning" : child.exitCode), {
            timeout: 15_000,
          })
          .toBe(0);
      } finally {
        child.stderr?.off("data", recordWarning);
      }

      await desktop.restart();
      expect(desktop.app.process().pid).not.toBe(processId);
      expect(
        await desktop.page.evaluate(
          async () => (await window.doolittle.getBackendState()).agentId,
        ),
      ).toBe(agentId);
      expect(await agentRequest(desktop.page, historyPath)).toEqual(history);
    } finally {
      await desktop.dispose();
    }
  });
});
