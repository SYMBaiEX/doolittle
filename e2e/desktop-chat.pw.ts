import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

const repoRoot = process.cwd();
const desktopRoot = resolve(repoRoot, "apps/desktop");
type Session = { sessionId: string; preview?: string[]; messageCount: number };
type StoredMessage = { role: string; text: string };

async function launchDesktop(profileDir: string, workspaceDir: string) {
  return electron.launch({
    args: [desktopRoot, `--user-data-dir=${profileDir}`],
    cwd: repoRoot,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: "",
      ELIZAOS_CLOUD_API_KEY: "",
      FAL_API_KEY: "",
      OPENAI_API_KEY: "",
      DOOLITTLE_DESKTOP_CWD: workspaceDir,
      DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
      DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
    },
  });
}

async function waitForChat(page: Page, pageErrors: string[]): Promise<void> {
  await expect(page).toHaveTitle(/Doolittle$/);
  await expect(page.locator(".window-runtime-status.ready")).toContainText(
    "Local runtime",
    { timeout: 45_000 },
  );
  await expect(page.locator(".recovery-shell")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  await expect(
    page.getByRole("textbox", { name: "Message Doolittle" }),
  ).toBeEnabled();
}

async function persistedTranscript(
  page: Page,
  prompt: string,
): Promise<{
  session: Session;
  messages: StoredMessage[];
}> {
  return page.evaluate(async (message) => {
    const getJson = async <T>(path: string): Promise<T> => {
      const response = await window.doolittle.requestAgent({
        path,
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Agent request failed with ${response.status}.`);
      }
      return JSON.parse(response.body) as T;
    };
    const sessionResponse = await getJson<{ sessions: Session[] }>(
      "/sessions?limit=100",
    );
    const session = sessionResponse.sessions.find((entry) =>
      entry.preview?.some((line) => line.includes(message)),
    );
    if (!session)
      throw new Error("The submitted chat session was not persisted.");
    const transcript = await getJson<{ messages: StoredMessage[] }>(
      `/sessions/messages?sessionId=${encodeURIComponent(session.sessionId)}&limit=100`,
    );
    return { session, messages: transcript.messages };
  }, prompt);
}

test.describe("Doolittle desktop offline chat", () => {
  test("submits, persists, and restores an offline chat transcript", async ({
    browserName,
  }) => {
    test.setTimeout(120_000);
    expect(browserName).toBe("chromium");
    const profileDir = mkdtempSync(
      join(tmpdir(), "doolittle-e2e-chat-profile-"),
    );
    const workspaceDir = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-e2e-chat-workspace-")),
    );
    const prompt = `offline chat persistence ${Date.now()}`;
    writeFileSync(
      join(profileDir, "workspace-state.json"),
      `${JSON.stringify({ currentPath: workspaceDir, recentPaths: [workspaceDir] })}\n`,
      "utf8",
    );

    let app: Awaited<ReturnType<typeof launchDesktop>> | undefined;
    try {
      app = await launchDesktop(profileDir, workspaceDir);
      const page = await app.firstWindow();
      const firstPageErrors: string[] = [];
      page.on("pageerror", (error) => firstPageErrors.push(error.message));
      await waitForChat(page, firstPageErrors);

      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await composer.focus();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      const chatTerminal = page.getByLabel("Chat terminal panel");
      await expect(chatTerminal).toHaveAttribute("data-open", "true");
      await expect(chatTerminal).toBeVisible();
      await expect(
        page.getByLabel("Chat terminal panel").getByRole("button", {
          name: "Ctrl+C",
        }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page
          .getByLabel("Chat terminal panel")
          .locator(".interactive-terminal-mode"),
      ).toContainText("PTY");
      await chatTerminal.getByRole("tabpanel").click();
      await page.keyboard.type("printf 'DOOLITTLE_%s\\n' INTERACTIVE");
      await page.keyboard.press("Enter");
      await expect
        .poll(() =>
          page
            .getByLabel("Chat terminal panel")
            .locator(".xterm-rows")
            .textContent(),
        )
        .toContain("DOOLITTLE_INTERACTIVE");
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      await expect(chatTerminal).toHaveAttribute("data-open", "false");
      await expect(chatTerminal).toHaveCount(0);
      await expect(composer).toBeFocused();
      await composer.fill(prompt);
      await composer.press("Enter");
      await expect(
        page.getByLabel("Conversation detail").getByText(prompt, {
          exact: true,
        }),
      ).toBeVisible();
      const userMessage = page
        .locator(".chat-message.user")
        .filter({ hasText: prompt })
        .last();
      const messageActions = userMessage.getByRole("toolbar", {
        name: "Message actions",
      });
      await expect(messageActions).toHaveCSS("opacity", "0");
      await userMessage.hover();
      await expect(messageActions).toHaveCSS("opacity", "1");
      const messageGeometry = await userMessage.evaluate((message) => {
        const bounds = (selector: string) => {
          const element = message.querySelector(selector);
          if (!element) throw new Error(`Missing ${selector}.`);
          const rect = element.getBoundingClientRect();
          return { top: rect.top, right: rect.right, bottom: rect.bottom };
        };
        return {
          label: bounds(".chat-message-label"),
          body: bounds(".chat-message-body"),
          actions: bounds(".chat-message-actions"),
        };
      });
      expect(messageGeometry.actions.top).toBeGreaterThanOrEqual(
        messageGeometry.label.bottom,
      );
      expect(messageGeometry.actions.top).toBeGreaterThanOrEqual(
        messageGeometry.body.bottom,
      );
      await messageActions.getByLabel("Copy message").click();
      await page.mouse.move(1, 1);
      await expect(messageActions).toHaveCSS("opacity", "0");
      const copyMessage = messageActions.getByLabel("Copy message");
      await copyMessage.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(copyMessage).toBeFocused();
      await expect(messageActions).toHaveCSS("opacity", "1");
      const assistantMessage = page.locator(".chat-message.assistant").last();
      await expect(assistantMessage).toBeVisible({ timeout: 45_000 });
      await expect(page.getByRole("status")).toContainText(
        "Doolittle replied.",
        {
          timeout: 45_000,
        },
      );
      await expect(assistantMessage.locator(".thinking")).toHaveCount(0, {
        timeout: 45_000,
      });
      const assistantText = (
        (await assistantMessage.locator(".chat-message-body").textContent()) ??
        ""
      ).trim();
      expect(assistantText).not.toBe("");
      const assistantActions = assistantMessage.getByRole("toolbar", {
        name: "Message actions",
      });
      await page.mouse.move(1, 1);
      await expect(assistantActions).toHaveCSS("opacity", "0");
      await assistantMessage.hover();
      await expect(assistantActions).toHaveCSS("opacity", "1");
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      expect(firstPageErrors).toEqual([]);

      await expect
        .poll(
          async () =>
            (await persistedTranscript(page, prompt)).session.messageCount,
        )
        .toBeGreaterThanOrEqual(2);
      const persisted = await persistedTranscript(page, prompt);
      expect(persisted.session.messageCount).toBeGreaterThanOrEqual(2);
      expect(persisted.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", text: prompt }),
          expect.objectContaining({
            role: "assistant",
            text: expect.stringContaining(assistantText),
          }),
        ]),
      );
      await app.close();
      app = undefined;

      app = await launchDesktop(profileDir, workspaceDir);
      const restartedPage = await app.firstWindow();
      const restartedPageErrors: string[] = [];
      restartedPage.on("pageerror", (error) =>
        restartedPageErrors.push(error.message),
      );
      await waitForChat(restartedPage, restartedPageErrors);
      const restored = await persistedTranscript(restartedPage, prompt);
      expect(restored.session.sessionId).toBe(persisted.session.sessionId);
      expect(restored.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", text: prompt }),
          expect.objectContaining({
            role: "assistant",
            text: expect.stringContaining(assistantText),
          }),
        ]),
      );
      await expect(restartedPage.locator(".recovery-shell")).toHaveCount(0);
      expect(restartedPageErrors).toEqual([]);
    } finally {
      await app?.close();
      rmSync(profileDir, { recursive: true, force: true });
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });
});
