import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import {
  agentRequest,
  installProjectDialog,
  launchDesktop,
  makeProject,
  openProjectChat,
  projectDialogCount,
} from "../support/desktop-core";

async function expectQuietFocus(control: Locator) {
  await control.focus();
  const style = await control.evaluate((node) => ({
    outline: getComputedStyle(node).outlineWidth,
    outlineStyle: getComputedStyle(node).outlineStyle,
    shadow: getComputedStyle(node).boxShadow,
  }));
  expect(style.outline === "0px" || style.outlineStyle === "none").toBe(true);
  const dimensions =
    style.shadow.replace(/rgba?\([^)]*\)/gu, "").match(/-?[0-9.]+px/gu) ?? [];
  // The documented one-pixel inset caret is allowed; frames/glows are not.
  expect(
    style.shadow === "none" ||
      (style.shadow.includes("inset") &&
        dimensions.every((value) => Math.abs(Number.parseFloat(value)) <= 1)),
  ).toBe(true);
}

test.describe("fresh native desktop", () => {
  test("creates an offline bot through the native chooser and sends its first chat", async () => {
    const desktop = await launchDesktop();
    try {
      const page = desktop.page;
      await page
        .getByRole("complementary", { name: "Navigation and bots" })
        .getByRole("button", { name: "New conversation", exact: true })
        .click();
      const chooser = page.getByRole("dialog", { name: "Start a chat with…" });
      await chooser.getByRole("button", { name: /Create a new bot/u }).click();
      const creation = page.getByRole("region", { name: "Create a new bot" });
      const answer = creation.locator(".bot-design-dock textarea");
      for (const value of [
        "Summarize local notes.",
        "Be brief and ask before file changes.",
        "Fresh Scout",
      ]) {
        await answer.fill(value);
        await expectQuietFocus(answer);
        await creation.getByRole("button", { name: "Send answer" }).click();
      }
      await expect(
        creation.getByRole("heading", { name: "Meet Fresh Scout" }),
      ).toBeVisible();
      await creation
        .getByRole("button", { name: "Review model and access" })
        .click();
      await creation
        .getByRole("combobox", { name: "Provider" })
        .selectOption("offline");
      await creation
        .getByRole("combobox", { name: "Model" })
        .selectOption("offline");
      const model = creation.getByRole("combobox", { name: "Model" });
      await expectQuietFocus(model);
      await expect(
        creation.getByRole("checkbox", { name: "Allow file and tool changes" }),
      ).not.toBeChecked();
      await creation
        .getByRole("button", { name: "Create Fresh Scout" })
        .click();
      await expect(creation).toBeHidden();
      const composer = page.getByRole("textbox", {
        name: "Message Fresh Scout",
      });
      // Creating a named bot starts a second cold SDK worker after the lead
      // runtime is ready. Wait for its observable readiness, not the default
      // five-second assertion budget; the journey still has its 60s deadline.
      await expect(composer).toBeEnabled({ timeout: 30_000 });
      await composer.fill("A short offline hello");
      await composer.press("Enter");
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText("A short offline hello"),
      ).toBeVisible();
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText("model provider is unavailable", { exact: false }),
      ).toBeVisible({ timeout: 60_000 });
      const catalog = await agentRequest<{
        bots: Array<{ name: string; model: { provider: string } }>;
      }>(page, "/bots");
      expect(
        catalog.bots.find((bot: { name: string }) => bot.name === "Fresh Scout")
          ?.model.provider,
      ).toBe("offline");
      await desktop.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(520, 780);
      });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(520);
      await expect(composer).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Navigation and bots" })
        .getByRole("button", { name: "New conversation", exact: true })
        .filter({ has: page.locator("svg") })
        .click();
      await expect(chooser).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(chooser).toBeHidden();
      await page.getByRole("button", { name: "Close navigation" }).click();
      await expect(
        page.getByRole("textbox", { name: /^Message /u }),
      ).toBeVisible();
    } finally {
      await desktop.dispose();
    }
  });

  test("remembers the exact bot and project grant across chats, reload and restart", async () => {
    const desktop = await launchDesktop();
    try {
      let page = desktop.page;
      const projectId = await makeProject(
        page,
        "Fresh private project",
        desktop.workspace,
      );
      await installProjectDialog(desktop.app, desktop.workspace);
      const first = await openProjectChat(page, projectId);
      expect(first).toBeTruthy();
      expect(await projectDialogCount(desktop.app)).toBe(1);
      const second = await openProjectChat(page, projectId);
      expect(second).not.toBe(first);
      expect(await projectDialogCount(desktop.app)).toBe(1);
      await page.reload();
      await expect(page.locator("[data-session-workbench]")).toBeVisible();
      await openProjectChat(page, projectId);
      expect(await projectDialogCount(desktop.app)).toBe(1);
      await desktop.restart();
      page = desktop.page;
      await installProjectDialog(desktop.app, desktop.workspace);
      await openProjectChat(page, projectId);
      expect(await projectDialogCount(desktop.app)).toBe(0);
    } finally {
      await desktop.dispose();
    }
  });

  test("cancelled, cross-bot and different-root access never inherit the grant", async () => {
    const desktop = await launchDesktop();
    try {
      const page = desktop.page;
      const projectId = await makeProject(
        page,
        "First root",
        desktop.workspace,
      );
      await installProjectDialog(desktop.app, desktop.workspace, "cancel");
      await page
        .getByRole("complementary", { name: "Navigation and bots" })
        .getByRole("button", { name: "New conversation", exact: true })
        .click();
      const chooser = page.getByRole("dialog", { name: "Start a chat with…" });
      await chooser
        .getByRole("combobox", { name: "Project for new chat" })
        .selectOption(projectId);
      await chooser
        .getByRole("region", { name: "Available bots" })
        .getByRole("button", { name: /^Doolittle\b/u })
        .click();
      await expect(
        chooser.getByText("This conversation could not be opened", {
          exact: false,
        }),
      ).toBeVisible();
      expect(await projectDialogCount(desktop.app)).toBe(1);
      // Reinstall in the same isolated process with a grant response; cancellation must not seed reuse.
      await installProjectDialog(desktop.app, desktop.workspace);
      await chooser
        .getByRole("region", { name: "Available bots" })
        .getByRole("button", { name: /^Doolittle\b/u })
        .click();
      await expect(chooser).toBeHidden();
      expect(await projectDialogCount(desktop.app)).toBe(1);
      const otherBot = await agentRequest<{ id: string }>(
        page,
        "/bots",
        "POST",
        {
          name: "Other Scout",
          persona: "Offline only.",
          model: { provider: "offline", model: "offline" },
        },
      );
      await page.evaluate(() =>
        window.dispatchEvent(new Event("doolittle:bot-catalog-changed")),
      );
      await expect(
        page
          .getByRole("complementary", { name: "Navigation and bots" })
          .getByText("Other Scout", { exact: true }),
      ).toBeVisible();
      await openProjectChat(page, projectId, "Other Scout");
      expect(await projectDialogCount(desktop.app)).toBe(2);
      await agentRequest(page, `/bots/${otherBot.id}`, "PATCH", {
        permissions: { allowDelegation: true },
      });
      await openProjectChat(page, projectId, "Other Scout");
      expect(await projectDialogCount(desktop.app)).toBe(3);
      const otherRoot = join(desktop.workspace, "different-root");
      mkdirSync(otherRoot);
      const otherProjectId = await makeProject(
        page,
        "Different root",
        otherRoot,
      );
      await installProjectDialog(desktop.app, otherRoot);
      await openProjectChat(page, otherProjectId);
      expect(await projectDialogCount(desktop.app)).toBe(1);
    } finally {
      await desktop.dispose();
    }
  });

  test("sidebar selection and row stay stable through two native catalog polls", async () => {
    const desktop = await launchDesktop();
    try {
      const page = desktop.page;
      const projectId = await makeProject(
        page,
        "Stable project",
        desktop.workspace,
      );
      const pulse = await agentRequest<{ id: string }>(page, "/bots", "POST", {
        name: "Poll witness",
        persona: "Offline poll witness.",
        model: { provider: "offline", model: "offline" },
      });
      await page.reload();
      await expect(page.locator("[data-session-workbench]")).toBeVisible();
      await installProjectDialog(desktop.app, desktop.workspace);
      const sessionId = await openProjectChat(page, projectId);
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await composer.fill("Stable sidebar marker");
      await composer.press("Enter");
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText("model provider is unavailable", { exact: false }),
      ).toBeVisible({ timeout: 60_000 });
      const sidebar = page.getByRole("complementary", {
        name: "Navigation and bots",
      });
      const row = sidebar.locator(
        'section[aria-label="Recent conversations"] button[aria-current="page"]',
      );
      await expect(row).toBeVisible();
      const beforeBox = await row.boundingBox();
      const before = await page.evaluate(() => {
        const ui = window.doolittle.ui;
        if (!ui) throw new Error("Native UI bridge unavailable");
        return ui.getSnapshot();
      });
      expect(before.selected?.sessionId).toBe(sessionId);
      await page.evaluate(() => {
        const sidebar = document.querySelector("#desktop-sidebar");
        const current = sidebar?.querySelector(
          'section[aria-label="Recent conversations"] button[aria-current="page"]',
        );
        if (!sidebar || !current)
          throw new Error("Selected sidebar row is unavailable");
        const state = { removedRows: 0 };
        const observer = new MutationObserver(() => {
          const row = sidebar.querySelector(
            'section[aria-label="Recent conversations"] button[aria-current="page"]',
          );
          if (row !== current || !current.isConnected) state.removedRows++;
        });
        observer.observe(sidebar, { childList: true, subtree: true });
        Object.assign(window, { __freshSidebarObservation: state });
      });
      // A main-process API update emits no renderer catalog-change event. Seeing
      // both names proves two real periodic reads without modifying frozen IPC.
      for (const name of ["Poll witness first", "Poll witness second"]) {
        await agentRequest(page, `/bots/${pulse.id}`, "PATCH", { name });
        await expect(sidebar.getByText(name, { exact: true })).toBeVisible({
          timeout: 15_000,
        });
      }
      const after = await page.evaluate(() => {
        const ui = window.doolittle.ui;
        if (!ui) throw new Error("Native UI bridge unavailable");
        return ui.getSnapshot();
      });
      expect(after.selected).toEqual(before.selected);
      // getSnapshot itself advances revision once; polls must not reselect.
      expect(after.revision).toBe(before.revision + 1);
      expect(
        await page.evaluate(
          () =>
            (
              window as typeof window & {
                __freshSidebarObservation: { removedRows: number };
              }
            ).__freshSidebarObservation.removedRows,
        ),
      ).toBe(0);
      const afterBox = await row.boundingBox();
      expect(beforeBox).not.toBeNull();
      expect(afterBox).not.toBeNull();
      expect(afterBox?.y).toBe(beforeBox?.y);
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText("Stable sidebar marker"),
      ).toBeVisible();
    } finally {
      await desktop.dispose();
    }
  });
  test("switches expressive themes without losing drafts and restores appearance after restart", async () => {
    test.setTimeout(120_000);
    const desktop = await launchDesktop();
    try {
      let page = desktop.page;
      const composer = page.getByRole("textbox", { name: /^Message /u });
      await composer.fill("Keep this coding draft while I change the theme.");
      await page
        .getByRole("button", { name: "Open settings", exact: true })
        .click();
      for (const [name, id, material] of [
        ["Anime Atelier", "anime-atelier", "cel"],
        ["Golden Gate Glass", "golden-gate-glass", "glass"],
      ]) {
        await page
          .getByRole("button", { name: new RegExp(`^${name}:`) })
          .click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", id);
        await expect(page.locator("html")).toHaveAttribute(
          "data-ui-material",
          material,
        );
        for (const appearance of ["light", "dark"]) {
          await page
            .getByRole("button", {
              name: `${appearance === "light" ? "Light" : "Dark"}: ${appearance === "light" ? "Light" : "Dark"} surfaces`,
              exact: true,
            })
            .click();
          await expect(page.locator("html")).toHaveAttribute(
            "data-appearance",
            appearance,
          );
          await page.screenshot({
            animations: "disabled",
            path: test.info().outputPath(`${id}-${appearance}.png`),
          });
          await page.getByRole("button", { name: /^Back to /u }).click();
          await expect(
            page.getByRole("textbox", { name: /^Message /u }),
          ).toHaveValue("Keep this coding draft while I change the theme.");
          await page.screenshot({
            animations: "disabled",
            path: test.info().outputPath(`${id}-${appearance}-chat.png`),
          });
          await page.locator(".chat-welcome-starter").first().click();
          const draft = page.getByRole("textbox", { name: /^Message /u });
          await expect(draft).toHaveValue("Help me think something through");
          await draft.fill("Keep this coding draft while I change the theme.");
          await page
            .getByRole("button", { name: "Open settings", exact: true })
            .click();
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(page.locator(".desktop-shell")).toHaveCSS(
        "transition-duration",
        "0s",
      );
      await desktop.restart();
      page = desktop.page;
      await expect(page.locator("html")).toHaveAttribute(
        "data-theme",
        "golden-gate-glass",
      );
      await expect(
        page.getByRole("textbox", { name: /^Message /u }),
      ).toHaveValue("Keep this coding draft while I change the theme.");
      await desktop.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(520, 780);
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expectQuietFocus(page.getByRole("textbox", { name: /^Message /u }));
      await desktop.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(520, 430);
      });
      await expect(
        page.getByRole("textbox", { name: /^Message /u }),
      ).toBeInViewport({ ratio: 1 });
      await page.emulateMedia({ forcedColors: "active" });
      await expect(page.locator(".chat-composer")).toHaveCSS(
        "backdrop-filter",
        "none",
      );
    } finally {
      await desktop.dispose();
    }
  });
  test("preserves a code transcript while changing complete theme compositions", async () => {
    const desktop = await launchDesktop();
    try {
      const page = desktop.page;
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await composer.fill(
        "Reference snippet:\n```ts\nexport const greeting = 'Hello, Doolittle';\n```",
      );
      await composer.press("Enter");
      const message = page.locator(".chat-message.user").first();
      await expect(message).toContainText("Hello, Doolittle");
      await expect(
        page.locator(".chat-message.assistant").first(),
      ).toBeVisible();
      await expect
        .poll(
          async () => {
            const { runs } = await agentRequest<{ runs: { status: string }[] }>(
              page,
              "/chat/runs",
            );
            return runs.some((run) =>
              ["complete", "error", "cancelled"].includes(run.status),
            );
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      const selected = await page.evaluate(
        async () => (await window.doolittle.ui?.getSnapshot())?.selected,
      );
      expect(selected).toBeTruthy();
      for (const name of ["Anime Atelier", "Golden Gate Glass"]) {
        await page
          .getByRole("button", { name: "Open settings", exact: true })
          .click();
        await page
          .getByRole("button", { name: new RegExp(`^${name}:`) })
          .click();
        await page
          .getByRole("button", { name: "Light: Light surfaces", exact: true })
          .click();
        await page.getByRole("button", { name: /^Back to /u }).click();
        await expect(message).toContainText("Hello, Doolittle");
        expect(
          await page.evaluate(
            async () => (await window.doolittle.ui?.getSnapshot())?.selected,
          ),
        ).toEqual(selected);
        await expect(page.locator(".chat-message.user")).toHaveCount(1);
        await expect(message.locator("pre")).toBeVisible();
        await expectQuietFocus(composer);
        await page.screenshot({
          animations: "disabled",
          path: test
            .info()
            .outputPath(
              `${name.replaceAll(" ", "-").toLowerCase()}-code-chat.png`,
            ),
        });
      }
    } finally {
      await desktop.dispose();
    }
  });
});
