import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import type { BotConversationScope } from "../../apps/desktop/src/shared/contracts";
import { themeContrast } from "../../packages/ui/src/themes";
import {
  agentRequest,
  installProjectDialog,
  launchDesktop,
  makeProject,
  openProjectChat,
  projectDialogCount,
} from "../support/desktop-core";
import { themeContrastFixture } from "../support/theme-contrast";

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
  test("starts with locked saved accounts and preserves them across restart", async () => {
    const desktop = await launchDesktop(undefined, { lockedAccounts: true });
    const credential = join(
      desktop.profile,
      "runtime/auth/openai-codex/doolittle-legacy-codex.json",
    );
    try {
      const before = readFileSync(credential, "utf8");
      await expect(
        desktop.page.locator("[data-session-workbench]"),
      ).toBeVisible();
      expect(
        await desktop.page.evaluate(
          async () => (await window.doolittle.getBackendState()).phase,
        ),
      ).toBe("ready");
      expect(desktop.startup.coreReadyMs).toBeLessThanOrEqual(
        desktop.startup.apiReadyMs,
      );
      await desktop.restart();
      expect(
        await desktop.page.evaluate(
          async () => (await window.doolittle.getBackendState()).phase,
        ),
      ).toBe("ready");
      expect(desktop.startup.coreReadyMs).toBeLessThanOrEqual(
        desktop.startup.apiReadyMs,
      );
      expect(readFileSync(credential, "utf8")).toBe(before);
    } finally {
      await desktop.dispose();
    }
  });

  test("uses the same panel navigation for chat context, workspace and scheduled work", async () => {
    const desktop = await launchDesktop();
    try {
      const { page } = desktop;
      const navigation = page.getByRole("navigation", {
        name: "Workspace navigation",
      });
      await installProjectDialog(desktop.app, desktop.workspace);
      await desktop.app.evaluate(({ dialog }, root) => {
        dialog.showOpenDialog = (async (...args) => {
          const options = args.at(-1) as Electron.OpenDialogOptions;
          if (options.title !== "Choose a local folder for this chat")
            throw new Error("Unexpected folder picker");
          return { canceled: false, filePaths: [root] };
        }) as typeof dialog.showOpenDialog;
      }, desktop.workspace);
      await navigation
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Choose a project folder" })
        .click();
      await expect.poll(() => projectDialogCount(desktop.app)).toBe(1);
      await expect(page.locator('[data-view="code"]')).toBeVisible();
      const origin = await page.evaluate(() =>
        window.doolittle.ui?.getSelection(),
      );
      const viewSwitcher = page.getByRole("group", {
        name: "Workbench view",
      });
      await viewSwitcher.getByRole("button", { name: "Agent View" }).click();
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await expect(composer).toBeEnabled({ timeout: 15_000 });
      await composer.fill("Keep this draft through panel changes");
      await viewSwitcher.getByRole("button", { name: "IDE View" }).click();
      await expect(page.locator('[data-view="code"]')).toBeVisible();
      expect(
        await page.evaluate(() => window.doolittle.ui?.getSelection()),
      ).toEqual(origin);
      await viewSwitcher.getByRole("button", { name: "Agent View" }).click();
      await expect(composer).toHaveValue(
        "Keep this draft through panel changes",
      );

      await page.getByRole("button", { name: "Open inspector" }).click();
      const context = page.getByRole("tablist", {
        name: "Conversation context views",
      });
      const details = context.getByRole("tab", { name: "Details" });
      await details.focus();
      await details.press("ArrowRight");
      const files = context.getByRole("tab", { name: "Files" });
      await expect(files).toBeFocused();
      await expect(details).toHaveAttribute("aria-selected", "true");
      await files.press("Enter");
      await expect(page.getByRole("tabpanel", { name: "Files" })).toBeVisible();
      await page
        .getByRole("button", { name: "Close inspector" })
        .last()
        .click();
      await expect(composer).toHaveValue(
        "Keep this draft through panel changes",
      );

      await navigation
        .getByRole("button", { name: "Workspace", exact: true })
        .click();
      const workspace = page.getByRole("tablist", { name: "Workspace views" });
      await expect(
        workspace.getByRole("tab", { name: "Editor" }),
      ).toHaveAttribute("aria-selected", "true");
      await workspace.getByRole("tab", { name: "Preview" }).click();
      await expect(
        page.getByRole("tabpanel", { name: "Preview" }),
      ).toBeVisible();
      await expect(
        navigation.getByRole("button", { name: "Workspace", exact: true }),
      ).toHaveAttribute("aria-current", "page");

      await navigation
        .getByRole("button", { name: "Automations", exact: true })
        .click();
      const work = page.getByRole("tablist", { name: "Work views" });
      await expect(
        work.getByRole("tab", { name: "Automations" }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("heading", { name: "Scheduled work" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "New automation" }).first(),
      ).toBeVisible();
      await page.getByRole("button", { name: "Weekday brief" }).click();
      await page
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Panel acceptance schedule");
      await page.getByRole("button", { name: "Create automation" }).click();
      await expect(
        page.getByText("Panel acceptance schedule", { exact: true }),
      ).toBeVisible();
      await work.getByRole("tab", { name: "Queue" }).click();
      await expect(
        navigation.getByRole("button", { name: "Work", exact: true }),
      ).toHaveAttribute("aria-current", "page");

      await page.getByRole("button", { name: "Doolittle home" }).click();
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
      const search = page.getByRole("button", { name: "Search", exact: true });
      const commandMenu = page.getByRole("dialog", { name: "Command menu" });
      await search.click();
      await commandMenu.getByRole("option", { name: /^Activity\b/ }).click();
      await expect(
        page.getByRole("heading", { name: "Activity", exact: true }),
      ).toBeVisible();
      await search.click();
      await commandMenu.getByRole("combobox").fill("insights");
      await commandMenu.getByRole("option", { name: /^Insights\b/ }).click();
      await expect(
        page.getByRole("heading", { name: "Analytics" }),
      ).toBeVisible();
      await search.click();
      await commandMenu.getByRole("combobox").fill("conversation");
      await commandMenu
        .getByRole("option")
        .filter({ hasText: "Start or continue a conversation" })
        .click();
      await expect(composer).toHaveValue(
        "Keep this draft through panel changes",
      );
      await desktop.app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.setSize(520, 780),
      );
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(520);
      await page.getByRole("button", { name: "Open inspector" }).click();
      await expect(context).toBeVisible();
      await expect(context.getByRole("tab", { name: "Files" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    } finally {
      await desktop.dispose();
    }
  });

  test("lands search on the project source and the exact log record", async () => {
    const desktop = await launchDesktop();
    const { page, profile, workspace } = desktop;
    try {
      const projectId = await makeProject(page, "Search fixture", workspace);
      await agentRequest(page, `/projects/${projectId}/resources`, "POST", {
        kind: "note",
        label: "Searchable project note",
        value: "A local project resource for this desktop journey.",
      });
      const log = {
        at: new Date().toISOString(),
        level: "error",
        scope: "search-fixture",
        message: "Unique local log for desktop navigation",
      };
      const logsPath = join(profile, "runtime", "logs");
      mkdirSync(logsPath, { recursive: true });
      appendFileSync(
        join(logsPath, "doolittle.jsonl"),
        `${JSON.stringify(log)}\n`,
      );
      await page.reload();
      await expect(page.locator("[data-session-workbench]")).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await window.doolittle.getBackendState()).phase,
          ),
        )
        .toBe("ready");

      const initial = await page.evaluate(() =>
        window.doolittle.ui?.getSelection(),
      );
      const search = page.getByRole("button", { name: "Search", exact: true });
      const commandMenu = page.getByRole("dialog", { name: "Command menu" });
      const query = commandMenu.getByRole("combobox");
      await search.click();
      await query.fill("Searchable project note");
      const resourceMatch = commandMenu.getByRole("option", {
        name: /Searchable project note/u,
      });
      await expect(resourceMatch).toBeVisible();
      await query.dispatchEvent("keydown", { key: "Enter", isComposing: true });
      await expect(commandMenu).toBeVisible();
      const caretKeys = await query.evaluate((input) =>
        ["Home", "End"].map((key) =>
          input.dispatchEvent(
            new KeyboardEvent("keydown", {
              key,
              bubbles: true,
              cancelable: true,
            }),
          ),
        ),
      );
      expect(caretKeys).toEqual([true, true]);
      await resourceMatch.click();
      const projects = page.getByRole("dialog", { name: "Projects" });
      const source = projects.locator("[data-search-target]");
      await expect(source).toContainText("Searchable project note");
      await expect(source).toBeFocused();
      expect(
        await page.evaluate(() => window.doolittle.ui?.getSelection()),
      ).toEqual(initial);
      await projects.getByRole("button", { name: "Close projects" }).click();

      await search.click();
      await query.fill(log.message);
      await commandMenu
        .getByRole("option", { name: new RegExp(log.message, "u") })
        .click();
      const event = page.getByRole("log").locator("[data-search-target]");
      await expect(event).toContainText(log.message);
      await expect(event).toBeFocused();

      const params = "kind=log&query=runtime+failure";
      const feed = await agentRequest<{ events: { title: string }[] }>(
        page,
        `/activity?${params}`,
      );
      const exported = await agentRequest<{ events: { title: string }[] }>(
        page,
        `/activity/export?${params}`,
      );
      expect(feed.events.map(({ title }) => title)).toContain(
        "Runtime failure recorded",
      );
      expect(exported.events.map(({ title }) => title)).toEqual(
        feed.events.map(({ title }) => title),
      );
    } finally {
      await desktop.dispose();
    }
  });

  test("opens long saved chats from search and pages back without losing the draft", async () => {
    const desktop = await launchDesktop();
    const { page } = desktop;
    try {
      const firstMessage =
        "Queueprovenance explains how the archive was signed.";
      const messages = Array.from({ length: 121 }, (_, index) => ({
        id: `imported-message-${index}`,
        role: index % 2 ? "assistant" : "user",
        text: index === 0 ? firstMessage : `Fixture turn ${index + 1}.`,
        createdAt: new Date(Date.UTC(2026, 10, 19, 12, index)).toISOString(),
        ...(index === 0
          ? {
              attachments: [
                {
                  id: "queue-archive-source",
                  name: "Queue archive notes.txt",
                  kind: "document",
                  mimeType: "text/plain",
                  sizeBytes: 9,
                  sha256: "a".repeat(64),
                },
              ],
            }
          : {}),
      }));
      await agentRequest(page, "/sessions/import", "POST", {
        archive: {
          schema: "doolittle.session.archive",
          version: 1,
          manifest: {
            exportedAt: "2026-11-19T16:00:00.000Z",
            messageCount: messages.length,
            attachmentCount: 1,
            omissions: [],
          },
          source: { application: "Doolittle", sessionId: "long-chat-fixture" },
          session: { title: "Long saved coding chat" },
          messages,
        },
      });
      await page.reload();
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const search = page.getByRole("dialog", { name: "Command menu" });
      await search.getByRole("combobox").fill("Queueprovenance");
      await search
        .getByRole("option", { name: new RegExp(firstMessage, "u") })
        .click();
      const transcript = page.getByRole("log", {
        name: "Conversation",
        exact: true,
      });
      const rows = transcript.locator("[data-message-role]");
      await expect(transcript.getByText("Fixture turn 121.")).toBeVisible();
      await expect(rows).toHaveCount(50);

      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      await composer.fill("Keep this draft while reading older messages.");
      const earlier = transcript.getByRole("button", {
        name: "Load earlier messages",
      });
      await earlier.click();
      await expect(rows).toHaveCount(100);
      await earlier.click();
      await expect(rows).toHaveCount(121);
      await expect(transcript.getByText(firstMessage)).toBeVisible();
      await expect(
        transcript.getByText("Queue archive notes.txt"),
      ).toBeVisible();
      await expect(earlier).toBeHidden();
      await expect(composer).toHaveValue(
        "Keep this draft while reading older messages.",
      );
    } finally {
      await desktop.dispose();
    }
  });

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
      const navigation = page.getByRole("complementary", {
        name: "Navigation and bots",
      });
      await navigation
        .getByRole("button", { name: /^Doolittle(?:,|$)/u })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeVisible();
      await navigation
        .getByRole("button", { name: /^Fresh Scout(?:,|$)/u })
        .click();
      await expect(composer).toHaveValue("A short offline hello");
      const conversation = page.getByLabel("Conversation detail").filter({
        has: composer,
      });
      // The draft remains editable during worker startup. Wait for dispatch
      // readiness before attempting the first turn.
      await expect(
        conversation.getByRole("button", { name: "Send message" }),
      ).toBeEnabled({ timeout: 30_000 });
      await composer.press("Enter");
      await expect(composer).toHaveValue("");
      await expect(
        conversation.getByText("A short offline hello", { exact: true }),
      ).toBeVisible();
      await expect(
        conversation.getByText("model provider is unavailable", {
          exact: false,
        }),
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
      const openNavigation = page.getByRole("button", {
        name: "Open navigation",
        exact: true,
      });
      await openNavigation.click();
      const drawer = page.getByRole("dialog", { name: "Navigation and bots" });
      const newConversation = drawer
        .getByRole("button", { name: "New conversation", exact: true })
        .filter({ has: page.locator("svg") });
      await newConversation.click();
      await expect(chooser).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(chooser).toBeHidden();
      await expect(drawer).toBeVisible();
      await expect(newConversation).toBeFocused();
      await drawer.getByRole("button", { name: "Close navigation" }).click();
      await expect(drawer).toBeHidden();
      await expect(openNavigation).toBeFocused();
      await expect(
        page.getByRole("textbox", { name: /^Message /u }),
      ).toBeVisible();
    } finally {
      await desktop.dispose();
    }
  });

  test("codes in the folder chosen from This computer and keeps private chats separate", async () => {
    const desktop = await launchDesktop();
    const { app, page, workspace } = desktop;
    const projectRoot = join(workspace, "local-coding");
    const file = "local-file.txt";
    const before = "Original code\n";
    const after = "Edited in the approved folder\n";
    const terminalProof = join(projectRoot, "command-root.txt");
    const draft = "Keep this draft in the local coding chat.";
    const readScopedFile = (
      scope: Pick<
        BotConversationScope,
        "botId" | "sessionId" | "workspacePath"
      >,
      path: string,
    ) =>
      page.evaluate(
        ({ scope, path }) =>
          window.doolittle.requestAgent({
            requestId: crypto.randomUUID(),
            path: `/workspace/read?${new URLSearchParams({ path })}`,
            method: "GET",
            headers: {},
            botId: scope.botId,
            originConversationId: scope.sessionId,
            workspacePath: scope.workspacePath,
          }),
        { scope, path },
      );

    try {
      mkdirSync(projectRoot);
      writeFileSync(join(projectRoot, file), before);
      await installProjectDialog(app, projectRoot);
      await app.evaluate(
        ({ dialog }, { file, projectRoot }) => {
          dialog.showOpenDialog = (async (...args) => {
            const options = args.at(-1) as Electron.OpenDialogOptions;
            if (
              options.title !== "Choose a local folder for this chat" ||
              !options.properties?.includes("openDirectory") ||
              options.properties.includes("multiSelections")
            )
              throw new Error("Expected a native project folder picker");
            return { canceled: false, filePaths: [projectRoot] };
          }) as typeof dialog.showOpenDialog;
          const confirm = dialog.showMessageBox;
          dialog.showMessageBox = (async (...args: unknown[]) => {
            const options = args.at(-1) as Electron.MessageBoxOptions;
            if (
              options.title === "Save workspace file?" &&
              options.message === file &&
              options.buttons?.includes("Save changes")
            ) {
              return {
                response: options.buttons.indexOf("Save changes"),
                checkboxChecked: false,
              };
            }
            return Reflect.apply(confirm, dialog, args);
          }) as typeof dialog.showMessageBox;
        },
        { file, projectRoot },
      );

      const picker = page.getByRole("dialog", {
        name: "Choose a workspace for a new chat",
      });
      const chooseWorkspace = page.getByRole("button", {
        name: /^Choose workspace\./u,
      });
      await chooseWorkspace.click();
      await picker
        .getByRole("button", { name: /^Choose local folder/u })
        .click();
      const localPicker = page.getByRole("button", {
        name: /^Choose workspace\. Current workspace This computer.*local-coding/u,
      });
      await expect(localPicker).toBeVisible();
      expect(await projectDialogCount(app)).toBe(1);

      const local = await page.evaluate(() =>
        window.doolittle.ui?.getSelection(),
      );
      if (!local?.projectId) throw new Error("Expected a scoped local chat");
      const localScope = { ...local, workspacePath: projectRoot };
      const opened = await readScopedFile(localScope, file);
      expect(opened.status).toBe(200);
      expect(JSON.parse(opened.body)).toMatchObject({ content: before });
      await expect(
        page.evaluate(
          ({ after, before, file, localScope }) =>
            window.doolittle.saveWorkspaceFile({
              botId: localScope.botId,
              originConversationId: localScope.sessionId,
              workspacePath: localScope.workspacePath,
              path: file,
              content: after,
              expectedContent: before,
            }),
          { after, before, file, localScope },
        ),
      ).resolves.toMatchObject({
        status: "saved",
      });
      expect(readFileSync(join(projectRoot, file), "utf8")).toBe(after);

      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      const encodedRoot = Buffer.from(projectRoot).toString("base64");
      await composer.fill(
        `!node -e "const cwd = process.cwd(); if (cwd !== Buffer.from('${encodedRoot}', 'base64').toString()) process.exit(1); require('node:fs').writeFileSync('command-root.txt', cwd); console.log(cwd);"`,
      );
      await composer.press("Enter");
      await expect
        .poll(() =>
          existsSync(terminalProof)
            ? readFileSync(terminalProof, "utf8")
            : null,
        )
        .toBe(projectRoot);
      const transcript = page.getByRole("log", {
        name: "local-coding conversation",
      });
      await expect(
        transcript.getByText(projectRoot, { exact: false }),
      ).toBeVisible({ timeout: 8_000 });
      await composer.fill(draft);

      await localPicker.click();
      await picker.getByRole("button", { name: /^Private workspace/u }).click();
      await expect(chooseWorkspace).toHaveAccessibleName(/Private workspace/u);
      const privateChat = await page.evaluate(() =>
        window.doolittle.ui?.getSelection(),
      );
      expect(privateChat?.sessionId).not.toBe(local.sessionId);
      expect(privateChat?.projectId).toBeUndefined();
      const { conversations } = await agentRequest<{
        conversations: BotConversationScope[];
      }>(page, `/bots/${encodeURIComponent(local.botId)}/conversations`);
      const privateScope = conversations.find(
        ({ sessionId }) => sessionId === privateChat?.sessionId,
      );
      if (!privateScope?.workspacePath)
        throw new Error("Expected a bound private workspace");
      expect(privateScope.workspacePath).not.toBe(projectRoot);
      const denied = await readScopedFile(privateScope, file);
      expect(denied.status).toBeGreaterThanOrEqual(400);
      expect(denied.body).not.toContain(after.trim());
      await expect(
        readScopedFile({ ...privateScope, workspacePath: projectRoot }, file),
      ).rejects.toThrow(
        "Requested workspace does not belong to this conversation.",
      );
      await expect(composer).toHaveValue("");

      await page.getByRole("button", { name: "Conversation options" }).click();
      await page.getByRole("menuitem", { name: "Workspace views" }).click();
      await page
        .getByRole("tablist", { name: "Open conversations" })
        .locator(`[aria-controls="session-panel-${local.sessionId}"]`)
        .click();
      await expect(localPicker).toBeVisible();
      await expect(composer).toHaveValue(draft);
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

  test("requires native approval for Git discard and worktree creation", async () => {
    const desktop = await launchDesktop();
    const { app, page, workspace } = desktop;
    const file = "approval-fixture.txt";
    const path = join(workspace, file);
    const worktreePath = ".doolittle/worktrees/approval-fixture";
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-C",
          workspace,
          "-c",
          "user.name=SYMBaiEX",
          "-c",
          "user.email=solsymbaiex@gmail.com",
          "-c",
          "commit.gpgsign=false",
          "-c",
          "core.hooksPath=/dev/null",
          ...args,
        ],
        { encoding: "utf8" },
      );
    try {
      git("init", "-qb", "main");
      writeFileSync(path, "original content\n");
      git("add", "--", file);
      git("commit", "-qm", "Create fixture");
      writeFileSync(path, "unsaved to git\n");
      const projectId = await makeProject(page, "Approval fixture", workspace);
      await installProjectDialog(app, workspace);
      await openProjectChat(page, projectId);
      await app.evaluate(
        ({ dialog }, { file, worktreePath }) => {
          const original = dialog.showMessageBox;
          let prompted = false;
          dialog.showMessageBox = (async (...args: unknown[]) => {
            const options = args.at(-1) as Electron.MessageBoxOptions;
            if (
              options.title === "Confirm destructive Git operation" &&
              options.message === `discard: ${file}` &&
              options.defaultId === options.cancelId &&
              options.buttons?.[1] === "Cancel"
            ) {
              const response = prompted ? 0 : 1;
              prompted = true;
              return { response, checkboxChecked: false };
            }
            if (
              options.title === "Create Git worktree?" &&
              options.message === "approval-fixture" &&
              options.detail?.includes(worktreePath)
            ) {
              return { response: 0, checkboxChecked: false };
            }
            return Reflect.apply(original, dialog, args);
          }) as typeof dialog.showMessageBox;
        },
        { file, worktreePath },
      );
      await page.getByRole("button", { name: "IDE View" }).click();
      await page.getByRole("button", { name: "Tools", exact: true }).click();
      const gitTab = page.getByRole("tab", { name: /^Git(?:\s+\d+)?$/u });
      await gitTab.click();
      const discard = page.getByRole("button", {
        name: `Discard ${file}`,
        exact: true,
      });
      await discard.click();
      await expect(page.getByText(/Git operation cancelled/i)).toBeVisible();
      expect(readFileSync(path, "utf8")).toBe("unsaved to git\n");

      await discard.click();
      await expect
        .poll(() => readFileSync(path, "utf8"))
        .toBe("original content\n");
      expect(git("status", "--porcelain", "--", file)).toBe("");
      await page.getByRole("tab", { name: /^Trees(?:\s+\d+)?$/u }).click();
      const environments = page.getByRole("region", {
        name: "Local execution environments",
      });
      await environments
        .getByRole("textbox", { name: "New branch" })
        .fill("approval-fixture");
      await environments
        .getByRole("textbox", { name: "Workspace-relative path" })
        .fill(worktreePath);
      await environments
        .getByRole("button", { name: "Review & create" })
        .click();
      await expect(
        environments.getByText(/Created.*approval-fixture/u),
      ).toBeVisible();
      expect(readFileSync(join(workspace, worktreePath, file), "utf8")).toBe(
        "original content\n",
      );
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
      await agentRequest(page, `/bots/${otherBot.id}/stop`, "POST");
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
          const pairs = await page.evaluate((markup) => {
            const probe = document.createElement("div");
            probe.setAttribute("aria-hidden", "true");
            probe.style.cssText =
              "position:fixed;left:-10000px;top:0;width:400px;pointer-events:none";
            probe.innerHTML = markup;
            document.querySelector(".desktop-shell")?.append(probe);
            try {
              const canvas = document.createElement("canvas");
              canvas.width = canvas.height = 1;
              const ctx = canvas.getContext("2d");
              if (!ctx) throw new Error("Color sampling unavailable");
              const color = (value: string) => {
                ctx.clearRect(0, 0, 1, 1);
                ctx.fillStyle = value;
                ctx.fillRect(0, 0, 1, 1);
                const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(
                  0,
                  0,
                  1,
                  1,
                ).data;
                return {
                  hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
                  alpha: a,
                };
              };
              const controls: [string, string, string][] = [
                ["metadata", ".dl-meta", ".dl-contact"],
                ["status", ".dl-run-state", ".dl-contact"],
                ["avatar", ".dl-avatar", ".dl-avatar"],
                [
                  "primary",
                  "[data-contrast-primary]",
                  "[data-contrast-primary]",
                ],
                [
                  "destructive",
                  "[data-contrast-destructive]",
                  "[data-contrast-destructive]",
                ],
              ];
              return controls.map(([label, fgSelector, bgSelector]) => {
                const fg = probe.querySelector(fgSelector);
                const bg = probe.querySelector(bgSelector);
                if (!fg || !bg)
                  throw new Error("Shared contrast control missing");
                return {
                  label,
                  fg: color(getComputedStyle(fg).color),
                  bg: color(getComputedStyle(bg).backgroundColor),
                };
              });
            } finally {
              probe.remove();
            }
          }, themeContrastFixture());
          for (const pair of pairs) {
            expect(
              pair.bg.alpha,
              `${id}/${appearance}/${pair.label} opaque pair`,
            ).toBe(255);
            expect(
              themeContrast(pair.fg.hex, pair.bg.hex),
              `${id}/${appearance}/${pair.label} contrast`,
            ).toBeGreaterThanOrEqual(4.5);
          }
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
