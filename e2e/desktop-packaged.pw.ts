import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { isolatedRuntimeEnvironment } from "./support/isolated-runtime-environment";

const executablePath = process.env.DOOLITTLE_DESKTOP_EXECUTABLE;
const fallbackResponse =
  "Doolittle's local runtime is ready, but its model provider is unavailable.";

test.describe("packaged Doolittle desktop", () => {
  test.skip(!executablePath, "DOOLITTLE_DESKTOP_EXECUTABLE is required");

  test("starts a saved offline named bot on its first message without manual activation", async () => {
    test.setTimeout(240_000);
    const profileDir = mkdtempSync(join(tmpdir(), "doolittle-named-profile-"));
    const workspaceDir = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-named-workspace-")),
    );
    const runtimeDir = join(profileDir, "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(
      join(runtimeDir, "settings.json"),
      `${JSON.stringify({ model: { provider: "offline", model: "offline", baseUrl: "", temperature: 0, maxTokens: 512 } })}\n`,
      "utf8",
    );
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({ currentPath: workspaceDir, recentPaths: [workspaceDir] })}\n`,
      "utf8",
    );
    const app = await electron.launch({
      executablePath,
      args: [`--user-data-dir=${profileDir}`],
      env: {
        ...isolatedRuntimeEnvironment(runtimeDir),
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
      },
    });

    try {
      const page = await app.firstWindow();
      await expect
        .poll(
          () =>
            page.evaluate(
              async () => (await window.doolittle.getBackendState()).phase,
            ),
          { timeout: 60_000 },
        )
        .toBe("ready");
      const bot = await page.evaluate(async (workspacePath) => {
        const response = await window.doolittle.requestAgent({
          requestId: crypto.randomUUID(),
          path: "/bots",
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "Jerry",
            persona: "Answer simply.",
            model: { provider: "offline", model: "offline" },
            workspacePath,
            permissions: {
              connectionIds: [],
              workspacePaths: [workspacePath],
              toolIds: [],
              allowMutation: false,
              allowDelegation: false,
            },
          }),
        });
        if (response.status !== 201) throw new Error(response.body);
        return JSON.parse(response.body) as { id: string; state: string };
      }, workspaceDir);
      expect(bot.state).toBe("stopped");
      await page.evaluate(() =>
        window.dispatchEvent(new Event("doolittle:bot-catalog-changed")),
      );
      await page
        .locator("#desktop-sidebar")
        .getByText("Jerry", { exact: true })
        .click();
      const composer = page.getByRole("textbox", { name: "Message Jerry" });
      await expect(composer).toBeEnabled();
      const catalogObservations: Array<{
        status: number;
        elapsedMs: number;
        code?: string;
      }> = [];
      try {
        await expect
          .poll(
            async () => {
              const began = performance.now();
              const result = await page.evaluate(async (botId) => {
                const response = await window.doolittle.requestAgent({
                  requestId: crypto.randomUUID(),
                  path: "/bots",
                  method: "GET",
                  headers: {},
                });
                const payload = JSON.parse(response.body) as {
                  code?: string;
                  bots?: Array<{ id: string; state: string }>;
                };
                return {
                  status: response.status,
                  code: payload.code,
                  state: payload.bots?.find((entry) => entry.id === botId)
                    ?.state,
                };
              }, bot.id);
              catalogObservations.push({
                status: result.status,
                elapsedMs: Math.round(performance.now() - began),
                ...(result.code ? { code: result.code } : {}),
              });
              // Health readiness alone does not certify the receipt sweep.
              // Retry only its explicitly unavailable status, never other errors
              // or evidence that selection already activated the named bot.
              if (
                result.status === 503 &&
                result.code === "bot_status_unavailable"
              ) {
                return "unavailable";
              }
              if (result.status !== 200 || result.state !== "stopped") {
                throw new Error(
                  `Cold bot catalog check failed: status=${result.status}, code=${result.code ?? "none"}, state=${result.state ?? "missing"}`,
                );
              }
              return "ready";
            },
            { timeout: 30_000 },
          )
          .toBe("ready");
      } finally {
        await test.info().attach("cold-bot-catalog-readiness", {
          body: JSON.stringify(catalogObservations),
          contentType: "application/json",
        });
      }
      const prompt = `Jerry first message ${Date.now()}`;
      await composer.fill(prompt);
      await expect(
        page.getByRole("button", { name: "Send message" }),
      ).toBeEnabled();
      await composer.press("Enter");
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText(prompt, { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText(fallbackResponse, { exact: false })
          .first(),
      ).toBeVisible({ timeout: 60_000 });
      const runs = await page.evaluate(async (botId) => {
        const response = await window.doolittle.requestAgent({
          requestId: crypto.randomUUID(),
          path: "/chat/runs?limit=20",
          method: "GET",
          headers: {},
          botId,
        });
        if (response.status !== 200) throw new Error(response.body);
        return JSON.parse(response.body) as {
          runs: Array<{ botId: string; sessionId: string; source: string }>;
        };
      }, bot.id);
      expect(runs.runs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ botId: bot.id, source: "desktop" }),
        ]),
      );

      // Missing scoped access fails before any provider call; the user's text
      // must remain retained for an intentional retry after configuration.
      const ungranted = await page.evaluate(async (workspacePath) => {
        const response = await window.doolittle.requestAgent({
          requestId: crypto.randomUUID(),
          path: "/bots",
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "No Grant",
            persona: "Wait for approved access.",
            model: { provider: "openai", model: "offline-test" },
            workspacePath,
            permissions: {
              connectionIds: [],
              workspacePaths: [workspacePath],
              toolIds: [],
              allowMutation: false,
              allowDelegation: false,
            },
          }),
        });
        if (response.status !== 201) throw new Error(response.body);
        return JSON.parse(response.body) as { id: string; state: string };
      }, workspaceDir);
      expect(ungranted.state).toBe("stopped");
      await page.evaluate(() =>
        window.dispatchEvent(new Event("doolittle:bot-catalog-changed")),
      );
      await page
        .locator("#desktop-sidebar")
        .getByText("No Grant", { exact: true })
        .click();
      const deniedComposer = page.getByRole("textbox", {
        name: "Message No Grant",
      });
      await expect(deniedComposer).toBeEnabled();
      const deniedPrompt = `Private grant required ${Date.now()}`;
      await deniedComposer.fill(deniedPrompt);
      await deniedComposer.press("Enter");
      await expect(deniedComposer).toHaveValue(deniedPrompt);
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText(/Select exactly one approved account/u),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
      rmSync(profileDir, { recursive: true, force: true });
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  test("boots the packaged preload bridge and completes an offline chat", async () => {
    test.setTimeout(120_000);
    const profileDir = mkdtempSync(
      join(tmpdir(), "doolittle-packaged-profile-"),
    );
    const workspaceDir = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-packaged-workspace-")),
    );
    const runtimeDir = join(profileDir, "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    // Offline bootstrap permits a local fallback; it intentionally does not
    // override a usable selected provider. Pin this isolated fixture instead
    // of relying on the product default or the host's linked Codex account.
    writeFileSync(
      join(runtimeDir, "settings.json"),
      `${JSON.stringify({
        model: {
          provider: "offline",
          model: "offline",
          baseUrl: "",
          temperature: 0,
          maxTokens: 512,
        },
        gateway: {
          sessionTimeoutMinutes: 120,
          mirrorResponsesToHistory: true,
        },
      })}\n`,
      "utf8",
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
        ...isolatedRuntimeEnvironment(runtimeDir),
        // A packaged app must ignore this source-only override.
        DOOLITTLE_DESKTOP_SOURCE_ROOT: join(profileDir, "not-a-checkout"),
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
      },
    });

    try {
      const page = await app.firstWindow();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await expect(page).toHaveTitle(/Doolittle$/);
      // Companion deliberately removes the permanent runtime-health toolbar.
      // Read the actual privileged bridge state, not presentation visibility.
      await expect
        .poll(
          () =>
            page.evaluate(
              async () => (await window.doolittle.getBackendState()).phase,
            ),
          { timeout: 60_000 },
        )
        .toBe("ready");
      await expect
        .poll(() => page.evaluate(() => typeof window.doolittle))
        .toBe("object");
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      await expect(
        page.getByRole("button", {
          name: /^Choose model\. Current route offline offline/,
        }),
      ).toBeVisible();
      const prompt = `packaged offline chat ${Date.now()}`;
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await expect(composer).toBeEnabled();
      await composer.focus();
      await expect
        .poll(() =>
          composer.evaluate((input) => {
            const styles = getComputedStyle(input);
            return {
              focused: document.activeElement === input,
              outline: styles.outlineStyle,
              border: styles.borderWidth,
              shadow: styles.boxShadow,
            };
          }),
        )
        .toEqual({
          focused: true,
          outline: "none",
          border: "0px",
          shadow: expect.stringMatching(/2px 0px 0px 0px inset/u),
        });
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      const chatTerminal = page.getByLabel("Chat terminal panel");
      await expect(chatTerminal).toBeVisible();
      // Opening uses a bounded 20-second post-bootstrap reconciliation budget.
      // Allow its receipt to settle; an unconfirmed result still fails this
      // assertion, and the test never clicks the manual retry control.
      await expect(
        chatTerminal.getByRole("button", {
          name: "Interrupt foreground process",
        }),
      ).toBeVisible({ timeout: 25_000 });
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
      const message = page
        .locator(".chat-message.user")
        .filter({ hasText: prompt });
      await message.click({ button: "right" });
      const messageMenu = page.getByRole("menu", {
        name: "Message actions",
        exact: true,
      });
      await expect(messageMenu).toBeVisible();
      await messageMenu
        .getByRole("menuitem", { name: "Copy message", exact: true })
        .click();
      await expect
        .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
        .toBe(prompt);
      await expect(messageMenu).toBeHidden();
      const keyboardInvoker = message.getByRole("button", {
        name: "Copy message",
        exact: true,
      });
      await keyboardInvoker.focus();
      await keyboardInvoker.press("Shift+F10");
      await expect(messageMenu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(messageMenu).toBeHidden();
      await expect(keyboardInvoker).toBeFocused();
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await app.close();
      rmSync(profileDir, { recursive: true, force: true });
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
