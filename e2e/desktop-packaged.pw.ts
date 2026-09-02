import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const fallbackResponse =
  "Doolittle's local runtime is ready, but its model provider is unavailable.";

test.describe("packaged Doolittle desktop", () => {
  test.skip(!executablePath, "DOOLITTLE_DESKTOP_EXECUTABLE is required");

  test("boots the packaged preload bridge and completes an offline chat", async () => {
    test.setTimeout(120_000);
    const profileDir = mkdtempSync(
      join(tmpdir(), "doolittle-packaged-profile-"),
    );
    const workspaceDir = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-packaged-workspace-")),
    );
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({
        currentPath: workspaceDir,
        recentPaths: [workspaceDir],
      })}\n`,
      "utf8",
    );
    const app = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${profileDir}`],
      env: {
        ...process.env,
        // A packaged app must ignore this source-only override.
        DOOLITTLE_DESKTOP_SOURCE_ROOT: join(profileDir, "not-a-checkout"),
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
        DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
      },
    });

    try {
      const page = await app.firstWindow();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await expect(page).toHaveTitle(/Doolittle$/);
      await expect(page.locator(".window-runtime-status.ready")).toContainText(
        "Local runtime",
        { timeout: 60_000 },
      );
      await expect
        .poll(() => page.evaluate(() => typeof window.doolittle))
        .toBe("object");
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      const prompt = `packaged offline chat ${Date.now()}`;
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await expect(composer).toBeEnabled();
      await composer.focus();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      const chatTerminal = page.getByLabel("Chat terminal panel");
      await expect(chatTerminal).toBeVisible();
      await expect(
        chatTerminal.getByRole("button", {
          name: "Interrupt foreground process",
        }),
      ).toBeVisible({ timeout: 15_000 });
      // The detailed mode label is hidden below the widest desktop breakpoint,
      // but the status text should still stay correct in the DOM.
      await expect(
        chatTerminal.locator(".interactive-terminal-mode"),
      ).toContainText("PTY");
      await chatTerminal.getByRole("tabpanel").click();
      await page.keyboard.type("printf 'DOOLITTLE_%s\\n' INTERACTIVE");
      await page.keyboard.press("Enter");
      await expect
        .poll(() =>
          page.evaluate((needle) => {
            const prefix = "doolittle.desktop.interactive-terminal.v2:";
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
          }, "DOOLITTLE_INTERACTIVE"),
        )
        .toContain("DOOLITTLE_INTERACTIVE");
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      await expect(chatTerminal).toHaveCount(0);
      await expect(composer).toBeFocused();
      await composer.fill(prompt);
      await composer.press("Enter");
      await expect(
        page.getByLabel("Conversation detail").getByText(prompt, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText(fallbackResponse, { exact: false })
          .first(),
      ).toBeVisible({
        timeout: 45_000,
      });
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await app.close();
      rmSync(profileDir, { recursive: true, force: true });
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
