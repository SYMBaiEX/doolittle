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
const fallbackResponse =
  "Doolittle's local runtime is ready, but its model provider is unavailable.";

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
      await expect(page.getByLabel("Chat terminal panel")).toBeVisible();
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+J" : "Control+J",
      );
      await expect(page.getByLabel("Chat terminal panel")).toHaveCount(0);
      await expect(composer).toBeFocused();
      await composer.fill(prompt);
      await composer.press("Enter");
      await expect(
        page.getByLabel("Conversation detail").getByText(prompt, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(fallbackResponse, { exact: false }),
      ).toBeVisible({
        timeout: 45_000,
      });
      await expect(page.locator(".recovery-shell")).toHaveCount(0);
      expect(firstPageErrors).toEqual([]);

      const persisted = await persistedTranscript(page, prompt);
      expect(persisted.session.messageCount).toBeGreaterThanOrEqual(2);
      expect(persisted.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "user", text: prompt }),
          expect.objectContaining({
            role: "assistant",
            text: expect.stringContaining(fallbackResponse),
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
            text: expect.stringContaining(fallbackResponse),
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
