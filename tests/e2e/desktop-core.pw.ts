import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { expect, type Locator, test } from "@playwright/test";
import type { BotConversationScope } from "../../apps/desktop/src/shared/contracts";
import { stableRuntimeUuid } from "../../packages/agent/src/runtime/stable-runtime-uuid";
import { GatewaySessionService } from "../../packages/agent/src/services/gateway-session-service";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service";
import { SessionMessageStore } from "../../packages/agent/src/services/session/messages";
import { ProjectStore } from "../../packages/agent/src/services/session/projects/store";
import { createSessionDatabase } from "../../packages/agent/src/services/session/service/support";
import { themeContrast } from "../../packages/ui/src/themes";
import {
  agentRequest,
  chooseSidebarChatScope,
  installProjectDialog,
  launchDesktop,
  makeProject,
  openProjectChat,
  projectDialogCount,
  sidebarChatScope,
} from "../support/desktop-core";
import { themeContrastFixture } from "../support/theme-contrast";

function runFixtureGit(workspace: string, ...args: string[]) {
  return execFileSync(
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
}

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
  test("applies preview viewport caps and keeps keyboard focus visible", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<h1>Responsive preview fixture</h1>");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Preview fixture did not bind a TCP port.");
    const desktop = await launchDesktop();
    try {
      const { app, page, workspace } = desktop;
      const project = await makeProject(page, "Preview fixture", workspace);
      await installProjectDialog(app, workspace);
      await openProjectChat(page, project);
      await page.getByRole("button", { name: "IDE View", exact: true }).click();
      await page.getByRole("tab", { name: "Preview", exact: true }).click();
      const url = page.getByRole("textbox", { name: "Preview URL" });
      await url.fill(`http://127.0.0.1:${address.port}`);
      await page.getByRole("button", { name: "Open", exact: true }).click();
      const frame = page.getByTitle("Local application preview", {
        exact: true,
      });
      await expect(
        page
          .frameLocator('iframe[title="Local application preview"]')
          .getByRole("heading"),
      ).toHaveText("Responsive preview fixture");
      const size = page.getByRole("combobox", { name: "Preview size" });
      for (const width of [2200, 720]) {
        await app.evaluate(({ BrowserWindow }, width) => {
          BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900);
        }, width);
        for (const [value, cap] of [
          ["responsive", Number.POSITIVE_INFINITY],
          ["desktop", 1440],
          ["tablet", 768],
          ["mobile", 390],
        ] as const) {
          await size.selectOption(value);
          await expect.soft
            .poll(
              async () =>
                frame.evaluate((node, cap) => {
                  const available = node.parentElement?.clientWidth ?? 0;
                  return Math.abs(
                    node.getBoundingClientRect().width -
                      Math.min(available, cap),
                  );
                }, cap),
              { message: `${value} preview at ${width}px window width` },
            )
            .toBeLessThanOrEqual(1);
        }
      }
      await page.getByRole("button", { name: "Open", exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(size).toBeFocused();
      await expect.soft(size).toHaveCSS("outline-style", "solid");
      await expect.soft(size).toHaveCSS("outline-width", "1px");
      await page.emulateMedia({ forcedColors: "active" });
      await expect(size).toHaveCSS("outline-style", "solid");
    } finally {
      await desktop.dispose();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  test("keeps compact window actions reachable and restores their focus", async () => {
    const desktop = await launchDesktop();
    try {
      const { app, page } = desktop;
      await page
        .getByRole("button", { name: "Open settings", exact: true })
        .click();
      const tools = page.locator(".window-tools");
      const menu = tools.getByRole("button", {
        name: "Window actions",
        exact: true,
      });
      const resize = (width: number) =>
        app.evaluate(({ BrowserWindow }, width) => {
          BrowserWindow.getAllWindows()[0]?.setContentSize(width, 900);
        }, width);
      await resize(761);
      await expect(menu).toBeHidden();
      await expect(
        tools.getByRole("button", { name: "Open settings", exact: true }),
      ).toBeVisible();
      await resize(760);
      await expect(menu).toBeVisible();
      await expect(
        tools.getByRole("button", { name: "Open settings", exact: true }),
      ).toBeHidden();
      for (const key of ["Tab", "Shift+Tab"]) {
        await menu.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeVisible();
        await page.keyboard.press(key);
        await expect(page.getByRole("menu")).toBeHidden();
        await expect(menu).not.toBeFocused();
        await expect
          .poll(() => page.evaluate(() => document.activeElement?.tagName))
          .not.toBe("BODY");
      }
      await menu.click();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await menu.click();
      await page
        .getByRole("menuitem", { name: "Open command palette", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(menu).toBeFocused();
      const activity = page.getByRole("dialog", { name: "Activity preview" });
      for (const closeWithEscape of [true, false]) {
        await menu.click();
        await page
          .getByRole("menuitem", { name: "Open Activity", exact: true })
          .click();
        const close = activity.getByRole("button", {
          name: "Close Activity",
          exact: true,
        });
        await expect(close).toBeFocused();
        if (closeWithEscape) await page.keyboard.press("Escape");
        else await close.click();
        await expect(activity).toBeHidden();
        await expect(menu).toBeFocused();
      }
      await page.emulateMedia({ forcedColors: "active" });
      await menu.focus();
      await page.keyboard.press("Enter");
      const items = page.getByRole("menuitem");
      for (const index of [0, 1]) {
        if (index > 0) await page.keyboard.press("ArrowDown");
        await expect(items.nth(index)).toBeFocused();
        await expect(items.nth(index)).toHaveCSS("outline-style", "solid");
        await expect(items.nth(index)).toHaveCSS("outline-width", "1px");
      }
    } finally {
      await desktop.dispose();
    }
  });

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
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
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
      await expect(
        page.getByRole("textbox", { name: "Name", exact: true }),
      ).toHaveValue("Weekday brief");
      await page.getByRole("button", { name: "Close builder" }).click();
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
      await expect(
        page.locator('[data-route-document="activity"] > .grid'),
      ).toHaveCSS("gap", "12px");
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
      await sidebarChatScope(page).click();
      await page
        .getByRole("menuitem", { name: "Add bot", exact: true })
        .click();
      const chooser = page.getByRole("dialog", {
        name: "Start a chat with Fresh Scout",
        exact: true,
      });
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
      await chooseSidebarChatScope(page, "Doolittle");
      await expect(
        page.getByRole("textbox", { name: "Message Doolittle" }),
      ).toBeVisible();
      await chooseSidebarChatScope(page, "Fresh Scout");
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
      const mobileScope = drawer.getByRole("button", { name: /^Chat scope:/u });
      await mobileScope.click();
      await expect(
        page.getByRole("menuitemradio", { name: "Fresh Scout", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(drawer).toBeVisible();
      await expect(mobileScope).toBeFocused();
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

  test("organizes chat history with project filters, collapsible sections and persistent pins", async () => {
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    try {
      await desktop.close();
      const runtime = join(desktop.profile, "runtime");
      const database = createSessionDatabase(runtime);
      const projectName = "Ocean client";
      const projectTitle = "Review the release plan";
      const recentTitle = "Summarize this week's changes";
      const generalTitle = "Collect old notes";
      const projectId = randomUUID();
      try {
        const projects = new ProjectStore(database);
        projects.create({
          id: projectId,
          name: projectName,
          primaryPath: desktop.workspace,
        });
        const messages = new SessionMessageStore(database, new EventEmitter());
        const recentAt = new Date().toISOString();
        const olderAt = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString();
        for (const [title, createdAt, project] of [
          [projectTitle, recentAt, projectId],
          [recentTitle, recentAt],
          [generalTitle, olderAt],
        ] as const) {
          const sessionId = randomUUID();
          messages.storeMessage({
            id: randomUUID(),
            sessionId,
            roomId: stableRuntimeUuid(sessionId),
            entityId: "fixture-user",
            role: "user",
            text: title,
            createdAt,
          });
          database
            .query(
              "INSERT INTO session_metadata (session_id, title, updated_at) VALUES (?1, ?2, ?3)",
            )
            .run(sessionId, title, createdAt);
          if (project)
            expect(projects.assignSession(sessionId, project)).toBe(true);
        }
      } finally {
        database.close();
      }

      await desktop.restart();
      let { page } = desktop;
      const sidebar = () =>
        page.getByRole("complementary", { name: "Navigation and bots" });
      const history = () =>
        sidebar().getByRole("navigation", { name: "Chat history" });
      const section = (name: string) =>
        history().getByRole("region", { name, exact: true });
      const chat = (root: Locator, name: string) =>
        root.getByRole("button", { name, exact: true });
      const filter = () =>
        sidebar().getByRole("button", { name: /^Filter chats:/u });
      const chooseFilter = async (name: string) => {
        await filter().click();
        await page.getByRole("menuitemradio", { name, exact: true }).click();
        await expect(filter()).toHaveAccessibleName(`Filter chats: ${name}`);
      };
      const scope = sidebarChatScope(page);
      await scope.focus();
      await scope.press("ArrowDown");
      await expect(
        page.getByRole("menuitemradio", { name: "Doolittle", exact: true }),
      ).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
      await expect(scope).toBeFocused();
      await expect(
        page.getByRole("menuitemradio", { name: "Doolittle", exact: true }),
      ).toBeHidden();
      await scope.press("ArrowDown");
      await page.keyboard.press("Tab");
      const newConversation = chat(sidebar(), "New conversation");
      await expect(newConversation).toBeFocused();
      await expect(scope).toHaveAttribute("aria-expanded", "false");

      const projectDisclosure = chat(section("Projects"), projectName);
      const projectChat = chat(section("Projects"), projectTitle);
      await expect(projectChat).toBeVisible();
      await expect(chat(section("Recent"), recentTitle)).toBeVisible();
      await expect(chat(section("General"), generalTitle)).toBeVisible();
      await projectDisclosure.click();
      await expect(projectDisclosure).toHaveAttribute("aria-expanded", "false");
      await expect(projectChat).toBeHidden();
      await projectDisclosure.click();
      await expect(projectChat).toBeVisible();
      await projectChat.focus();
      await expect(page.getByRole("tooltip")).toContainText(projectName);
      await projectChat.click();
      await expect(projectChat).toHaveAttribute("aria-current", "page");

      await chooseFilter(projectName);
      await expect(projectChat).toBeVisible();
      await expect(chat(history(), recentTitle)).toBeHidden();
      await expect(chat(history(), generalTitle)).toBeHidden();
      await newConversation.click();
      const chooser = page.getByRole("dialog", {
        name: "Start a chat with Doolittle",
      });
      await expect(
        chooser.getByRole("combobox", { name: "Project for new chat" }),
      ).toHaveValue(projectId);
      await page.keyboard.press("Escape");
      await expect(chooser).toBeHidden();
      await expect(newConversation).toBeFocused();

      await chooseFilter("General");
      await expect(projectChat).toBeHidden();
      await expect(chat(section("General"), generalTitle)).toBeVisible();
      await expect(
        page
          .getByLabel("Conversation detail")
          .getByText(projectTitle, { exact: true }),
      ).toBeVisible();
      await chooseFilter("All projects");
      await projectChat.hover();
      await chat(section("Projects"), `${projectTitle} actions`).click();
      await page
        .getByRole("menuitem", { name: "Pin conversation", exact: true })
        .click();
      await expect(chat(section("Pinned"), projectTitle)).toBeVisible();
      await expect(chat(history(), projectTitle)).toHaveCount(1);
      await chat(section("Recent"), "Recent").click();
      await expect(chat(history(), recentTitle)).toBeHidden();

      await desktop.restart();
      page = desktop.page;
      const pinnedChat = chat(section("Pinned"), projectTitle);
      await expect(pinnedChat).toBeVisible();
      await expect(chat(section("Recent"), "Recent")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await expect(chat(history(), recentTitle)).toBeHidden();
      await pinnedChat.hover();
      await chat(section("Pinned"), `${projectTitle} actions`).click();
      await page
        .getByRole("menuitem", { name: "Unpin conversation", exact: true })
        .click();
      await expect(pinnedChat).toBeHidden();
      await expect(chat(section("Projects"), projectTitle)).toBeVisible();
      await chat(section("Recent"), "Recent").click();
      await expect(chat(section("Recent"), recentTitle)).toBeVisible();
    } finally {
      await desktop.dispose();
    }
  });

  test("switches complete chat histories and starts new chats for the selected bot", async () => {
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    try {
      let { page } = desktop;
      const { defaultBotId } = await agentRequest<{ defaultBotId: string }>(
        page,
        "/bots",
      );
      const scout = await agentRequest<{ id: string }>(page, "/bots", "POST", {
        name: "Inventory Scout",
        persona: "Offline inventory fixture.",
        model: { provider: "offline", model: "offline" },
      });
      const bindConversation = (botId: string) =>
        agentRequest(
          page,
          `/bots/${encodeURIComponent(botId)}/conversations`,
          "POST",
          {
            sessionId: randomUUID(),
          },
        );
      await bindConversation(defaultBotId);
      for (let index = 0; index < 10; index += 1)
        await bindConversation(scout.id);
      await chooseSidebarChatScope(page, "Groups");
      await expect(
        page.getByRole("heading", { name: "No group chats yet", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: /^Message /u }),
      ).toHaveCount(0);
      // Seed the same durable records a connector writes before reopening the
      // profile. The encoded account name makes this a legacy opaque session ID.
      await desktop.close();
      const runtime = join(desktop.profile, "runtime");
      const groupTitle = "Telegram fixture group";
      const groupText = "Stored Telegram group fixture";
      const route = new GatewaySessionService(
        join(runtime, "gateway", "sessions"),
      ).resolve({
        platform: "telegram",
        userId: "123",
        roomId: "-100123",
        channelType: "supergroup",
        text: groupText,
        metadata: { accountId: "fixture bot" },
      });
      expect(route.sessionKey).toContain("%20");
      const database = createSessionDatabase(runtime);
      try {
        new SessionMessageStore(database, new EventEmitter()).storeMessage({
          id: randomUUID(),
          sessionId: route.sessionKey,
          roomId: stableRuntimeUuid(route.sessionKey),
          entityId: "fixture-user",
          role: "user",
          text: groupText,
          createdAt: new Date().toISOString(),
        });
        database
          .query(
            "INSERT INTO session_metadata (session_id, title, updated_at) VALUES (?1, ?2, ?3)",
          )
          .run(route.sessionKey, groupTitle, new Date().toISOString());
      } finally {
        database.close();
      }
      await desktop.restart();
      page = desktop.page;

      const sidebar = page.getByRole("complementary", {
        name: "Navigation and bots",
      });
      const scope = sidebarChatScope(page);
      const historyRows = sidebar.getByRole("button", {
        name: "Conversation",
        exact: true,
      });
      const newConversation = sidebar.getByRole("button", {
        name: "New conversation",
        exact: true,
      });
      await expect(scope).toBeVisible();
      await chooseSidebarChatScope(page, "Doolittle");
      await expect(historyRows).toHaveCount(1);
      await chooseSidebarChatScope(page, "Inventory Scout");
      await expect(historyRows).toHaveCount(10);

      await chooseSidebarChatScope(page, "Groups");
      const groupChat = sidebar.getByRole("button", {
        name: groupTitle,
        exact: true,
      });
      await expect(groupChat).toHaveCount(1);
      await expect(historyRows).toHaveCount(0);
      await expect(newConversation).toBeDisabled();
      await groupChat.click();
      const groupTranscript = page.getByLabel("Conversation detail").filter({
        has: page.getByText(groupText, { exact: true }),
      });
      await expect(groupTranscript).toBeVisible();
      await expect(
        groupTranscript.getByText("Read-only conversation history", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(groupTranscript.getByRole("textbox")).toHaveCount(0);

      await chooseSidebarChatScope(page, "Inventory Scout");
      await expect(historyRows).toHaveCount(10);
      await expect(groupChat).toHaveCount(0);
      const previous = await page.evaluate(() =>
        window.doolittle.ui?.getSelection(),
      );
      await newConversation.click();
      const chooser = page.getByRole("dialog", {
        name: "Start a chat with Inventory Scout",
        exact: true,
      });
      await expect(
        chooser.getByRole("button", { name: /^Start chat with /u }),
      ).toHaveCount(1);
      await chooser
        .getByRole("button", {
          name: "Start chat with Inventory Scout",
          exact: true,
        })
        .click();
      await expect(chooser).toBeHidden();
      await expect(
        page.getByRole("textbox", { name: "Message Inventory Scout" }),
      ).toBeVisible();
      const selected = await page.evaluate(() =>
        window.doolittle.ui?.getSelection(),
      );
      expect(selected?.botId).toBe(scout.id);
      expect(selected?.sessionId).toBeTruthy();
      expect(selected?.sessionId).not.toBe(previous?.sessionId);
      const ownership = await agentRequest<{
        conversation: BotConversationScope;
      }>(
        page,
        `/bots/conversations/owner?sessionId=${encodeURIComponent(selected?.sessionId ?? "")}`,
      );
      expect(ownership.conversation.botId).toBe(scout.id);
      await chooseSidebarChatScope(page, "Doolittle");
      await expect(historyRows).toHaveCount(1);
    } finally {
      await desktop.dispose();
    }
  });

  test("renders saved coding responses and lets operators inspect and copy their evidence", async () => {
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    const title = "Fixture coding review";
    const sessionId = randomUUID();
    const runId = randomUUID();
    const roomId = stableRuntimeUuid(sessionId);
    const code = [
      "export function describeBuild(): string {",
      `  return "${"Fixture code should retain its exact source when copied. ".repeat(4).trimEnd()}";`,
      "}",
    ].join("\n");
    const diff = [
      "@@ -1 +1 @@",
      '-export const stage = "before";',
      '+export const stage = "after";',
    ].join("\n");
    const toolCall = {
      type: "tool_call",
      messageId: "fixture-tool-message",
      toolCall: {
        id: "fixture-command",
        name: "TERMINAL_SHELL",
        status: "running",
        arguments: { command: "printf 'Fixture output\\n'" },
      },
    };
    const toolResult = {
      type: "tool_result",
      toolCallId: toolCall.toolCall.id,
      result: {
        stdout: "Fixture output\n",
        stderr: "",
        exitCode: 0,
        durationMs: 125,
      },
    };

    try {
      const { defaultBotId } = await agentRequest<{ defaultBotId: string }>(
        desktop.page,
        "/bots",
      );
      await agentRequest(
        desktop.page,
        `/bots/${encodeURIComponent(defaultBotId)}/conversations`,
        "POST",
        { sessionId },
      );
      await desktop.close();
      const runtime = join(desktop.profile, "runtime");
      const database = createSessionDatabase(runtime);
      const runs = new RunControllerService(runtime);
      try {
        const messages = new SessionMessageStore(database, new EventEmitter());
        const createdAt = Date.now();
        const text = [
          "## Build review",
          "The `describeBuild` function documents the release stage.",
          `\`\`\`typescript filename="src/main.ts"\n${code}\n\`\`\``,
          `\`\`\`diff\n${diff}\n\`\`\``,
          "| Check | Status |\n| --- | --- |\n| Build | Passing |",
          JSON.stringify(toolCall),
          JSON.stringify(toolResult),
        ].join("\n\n");
        const turns = [
          { id: randomUUID(), role: "user", text: "Review the build." },
          { id: randomUUID(), role: "assistant", text },
          { id: randomUUID(), role: "user", text: "Apply the status edit." },
          {
            id: `assistant:${runId}`,
            role: "assistant",
            text: "Updated the status in `src/main.ts`.",
          },
        ] as const;
        turns.forEach((turn, index) => {
          messages.storeMessage({
            ...turn,
            sessionId,
            roomId,
            entityId: `fixture-${turn.role}`,
            createdAt: new Date(createdAt + index).toISOString(),
          });
        });
        database
          .query(
            "INSERT INTO session_metadata (session_id, title, updated_at) VALUES (?1, ?2, ?3)",
          )
          .run(sessionId, title, new Date(createdAt).toISOString());

        const stopObserving = runs.onUpdate((event) => {
          runs.appendTaskEvent(runId, "agent.run", event);
        });
        runs.startTurn({
          sessionId,
          runId,
          roomId,
          source: "desktop",
          message: "Apply the status edit.",
          runDepth: "standard",
          configuredMaxIterations: 45,
          progressMode: "verbose",
        });
        runs.noteActionStarted(sessionId, "WRITE_FILE");
        runs.recordLocalMutation(sessionId, {
          action: "WRITE_FILE",
          requestedPath: "src/main.ts",
          resolvedPath: "src/main.ts",
          success: true,
          bytes: 40,
        });
        runs.noteActionCompleted(sessionId, "WRITE_FILE");
        const active = runs.getByRunId(runId);
        if (!active) throw new Error("The activity fixture lost its run.");
        runs.appendTaskEvent(runId, "agent.run", {
          type: "action-completed",
          sessionId,
          run: active,
          activity: {
            id: "build-check",
            action: "TERMINAL_SHELL",
            title: "Check the build",
            phase: "completed",
            command: "nub run typecheck",
            exitCode: 0,
            output: "Fixture typecheck output",
          },
        });
        runs.finishTurn(sessionId, "complete");
        stopObserving();
        await runs.finishTaskEvent(runId, "response.completed", {});
      } finally {
        database.close();
        runs.dispose();
      }

      await desktop.restart();
      const { page } = desktop;
      const savedRuns = await agentRequest<{ runs: Array<{ runId: string }> }>(
        page,
        "/chat/runs?include_updates=true",
      );
      expect(savedRuns.runs).toContainEqual(
        expect.objectContaining({ runId, sessionId, status: "complete" }),
      );
      const activity = await agentRequest<{ updates: unknown[] }>(
        page,
        `/chat/runs/${encodeURIComponent(runId)}?include_updates=true`,
      );
      expect(activity.updates).toContainEqual(
        expect.objectContaining({
          activity: expect.objectContaining({ id: "build-check" }),
        }),
      );
      const savedSessions = await agentRequest<{
        sessions: Array<{ sessionId: string; title: string }>;
      }>(page, "/sessions");
      expect(savedSessions.sessions).toContainEqual(
        expect.objectContaining({ sessionId, title }),
      );
      const clipboardWrites = await page.evaluateHandle(() => {
        const writes: string[] = [];
        // Verify the renderer clipboard payload without replacing the user's clipboard.
        Object.defineProperty(navigator.clipboard, "writeText", {
          value: async (value: string) => {
            writes.push(value);
          },
        });
        return writes;
      });
      await page
        .getByRole("navigation", { name: "Chat history" })
        .getByRole("button", { name: title, exact: true })
        .click();
      const transcript = page.getByRole("log", { name: "Conversation" });
      await expect(
        transcript.getByRole("heading", { name: "Build review" }),
      ).toBeVisible();
      await expect(transcript.getByRole("table")).toContainText("Passing");
      const prompt = transcript
        .locator(".chat-transcript-entry")
        .filter({ hasText: "Review the build." });
      const messageActions = prompt.getByRole("button", {
        name: "More message actions",
      });
      await expect(messageActions).toBeVisible();
      await messageActions.press("Enter");
      await expect(
        page.getByRole("menuitem", { name: "Edit in a new branch" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(messageActions).toBeFocused();

      const source = transcript.getByRole("figure", { name: "src/main.ts" });
      await expect(
        source.getByText("TypeScript", { exact: true }),
      ).toBeVisible();
      const wrap = source.getByRole("button", { name: "Wrap lines" });
      const scrollRegion = source.getByRole("region", {
        name: "src/main.ts code",
      });
      const overflow = () =>
        scrollRegion.evaluate((node) => node.scrollWidth - node.clientWidth);
      await expect.poll(overflow).toBeGreaterThan(0);
      await expect(wrap).toHaveAttribute("aria-pressed", "false");
      await wrap.click();
      await expect(wrap).toHaveAttribute("aria-pressed", "true");
      await expect.poll(overflow).toBeLessThanOrEqual(1);
      await source.getByRole("button", { name: "Copy code" }).click();
      await expect.poll(() => clipboardWrites.jsonValue()).toEqual([code]);
      const diffBlock = transcript.getByRole("figure", { name: "Diff" });
      await expect(
        diffBlock.locator('[data-code-change="added"]'),
      ).toContainText('+export const stage = "after";');
      await expect(
        diffBlock.locator('[data-code-change="removed"]'),
      ).toContainText('-export const stage = "before";');
      await diffBlock.getByRole("button", { name: "Copy code" }).click();
      await expect
        .poll(() => clipboardWrites.jsonValue())
        .toEqual([code, diff]);

      const toolActivity = transcript.getByRole("button", {
        name: /Tool activity/u,
      });
      await toolActivity.click();
      const commandStep = transcript.getByRole("button", {
        name: "Show Shell command details",
      });
      await expect(commandStep).toContainText("Exit 0");
      await expect(commandStep).toContainText("125 ms");
      await commandStep.click();
      await expect(
        transcript.getByText("Fixture output", { exact: true }),
      ).toBeVisible();
      await transcript.getByRole("button", { name: "Copy output" }).click();
      await expect
        .poll(() => clipboardWrites.jsonValue())
        .toEqual([code, diff, toolResult.result.stdout]);

      const disclosure = transcript.getByRole("button", {
        name: "Run complete",
      });
      await expect(disclosure).toHaveAttribute("aria-expanded", "false");
      await disclosure.press("Enter");
      await expect(
        transcript.getByRole("region", { name: "Changed files" }),
      ).toContainText("src/main.ts");
      const runReceipt = transcript.locator(".chat-run-receipt");
      await runReceipt
        .getByRole("button", { name: "Show Shell command details" })
        .click();
      await expect(
        runReceipt
          .getByLabel("Command", { exact: true })
          .getByText("nub run typecheck", { exact: true }),
      ).toBeVisible();
      await expect(
        runReceipt.getByText("Fixture typecheck output", { exact: true }),
      ).toBeVisible();
    } finally {
      await desktop.dispose();
    }
  });

  test("codes in the folder chosen from This computer and keeps private chats separate", async () => {
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    const { app, page, workspace } = desktop;
    const projectRoot = join(workspace, "local-coding");
    const file = "local-file.txt";
    const before = "Original code\n";
    const after = "Edited in the approved folder\n";
    const terminalProof = join(projectRoot, "command-root.txt");
    const draft = "Keep this draft in the local coding chat.";
    const nextLine = "Check the test coverage too.";
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
      const localPanelId = await page
        .getByRole("tabpanel")
        .filter({ has: transcript })
        .getAttribute("id");
      if (!localPanelId) throw new Error("Expected a linked local chat tab");
      await composer.fill(draft);
      await composer.press("End");
      await composer.press("Shift+Enter");
      await composer.pressSequentially(nextLine);
      await expect(composer).toHaveValue(`${draft}\n${nextLine}`);

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
        .locator(`[aria-controls="${localPanelId}"]`)
        .click();
      await expect(localPicker).toBeVisible();
      await expect(composer).toHaveValue(`${draft}\n${nextLine}`);
    } finally {
      await desktop.dispose();
    }
  });

  test("opens the selected chat project in IDE View before the first message", async () => {
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    const { app, page, workspace } = desktop;
    const alpha = {
      name: "Alpha fixture project",
      root: join(workspace, "alpha-local"),
      file: "alpha-only.ts",
      marker: "alphaProjectSource",
    };
    const beta = {
      name: "Beta fixture project",
      root: join(workspace, "beta-local"),
      file: "beta-only.ts",
      marker: "betaProjectSource",
    };

    try {
      for (const project of [alpha, beta]) {
        mkdirSync(project.root);
        writeFileSync(
          join(project.root, project.file),
          `export const ${project.marker} = true;\n`,
        );
        runFixtureGit(project.root, "init", "-qb", "main");
      }
      const alphaId = await makeProject(page, alpha.name, alpha.root);
      const betaId = await makeProject(page, beta.name, beta.root);
      await installProjectDialog(app, alpha.root);
      await openProjectChat(page, alphaId);

      const views = page.getByRole("group", { name: "Workbench view" });
      const chatView = views.getByRole("button", { name: "Agent View" });
      const ideView = views.getByRole("button", { name: "IDE View" });
      const ide = page.locator('[data-view="code"]:not([hidden])');
      const tree = ide.getByRole("tree", { name: "Workspace files" });
      const composerWorkspace = page.getByRole("button", {
        name: /^Choose workspace\. Current workspace/u,
      });
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      const composerSession = () =>
        composer.evaluate((node) =>
          node
            .closest("[data-session-panel]")
            ?.getAttribute("data-session-panel"),
        );
      const openInIde = async (project: typeof alpha) => {
        await ideView.click();
        await expect(
          ide.getByRole("button", { name: "Change repository" }),
        ).toHaveAttribute("title", project.root);
        await tree
          .getByRole("treeitem", { name: project.file, exact: true })
          .click();
        await expect(ide.locator(".monaco-editor .view-lines")).toContainText(
          project.marker,
        );
      };
      const selectedProject = () =>
        page.evaluate(
          async () => (await window.doolittle.ui?.getSelection())?.projectId,
        );

      await openInIde(alpha);
      await chatView.click();
      await expect(composerWorkspace).toHaveAttribute("title", alpha.root);

      // Beta has no conversation yet. Activate it from Chat while the previous
      // IDE and the fixture's default workspace have different roots.
      await installProjectDialog(app, beta.root, "cancel");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      const palette = page.getByRole("dialog", { name: "Command menu" });
      await palette.getByRole("combobox").fill(beta.name);
      await palette
        .getByRole("option", { name: `${beta.name} 0 conversations` })
        .click();
      await expect(composerWorkspace).toHaveAccessibleName(
        `Choose workspace. Current workspace ${beta.name} · Approval needed.`,
      );
      const betaDraft = "Review the selected project's source.";
      await composer.fill(betaDraft);
      const betaSession = await composerSession();
      expect(betaSession).toBeTruthy();

      await ideView.click();
      await expect(
        page.getByText("Project access was not confirmed", { exact: true }),
      ).toBeVisible();
      await expect(ide).toHaveCount(0);
      await expect(composer).toHaveValue(betaDraft);
      expect(await composerSession()).toBe(betaSession);
      expect(await projectDialogCount(app)).toBe(1);

      await installProjectDialog(app, beta.root);
      await openInIde(beta);
      await expect.poll(selectedProject).toBe(betaId);
      expect(await projectDialogCount(app)).toBe(1);

      // Selecting a saved workspace from the composer must retarget the
      // editor to that chat as well, without waiting for a model turn.
      await chatView.click();
      await expect(composerWorkspace).toHaveAttribute("title", beta.root);
      await expect(composer).toHaveValue(betaDraft);
      expect(await composerSession()).toBe(betaSession);
      await composerWorkspace.click();
      await page
        .getByRole("dialog", { name: "Choose a workspace for a new chat" })
        .getByRole("button", { name: new RegExp(`^${alpha.name}\\b`, "u") })
        .click();
      await openInIde(alpha);
      await expect.poll(selectedProject).toBe(alphaId);
    } finally {
      await desktop.dispose();
    }
  });

  test("keeps IDE buffers, chat drafts, and the workspace shell through view changes", async () => {
    test.setTimeout(90_000);
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    const { app, page, workspace } = desktop;
    const first = "src/engine.ts";
    const second = "src/helpers.ts";
    const changed = "README.md";
    const firstBase = "export const originalEngine = true;\n";
    const secondBase = "export const originalHelper = true;\n";
    const firstEdit = "export const retainedEngine = true;";
    const secondEdit = "export const retainedHelper = true;";
    const chatDraft = "Keep this implementation plan in my chat.";

    try {
      mkdirSync(join(workspace, "src"));
      writeFileSync(join(workspace, first), firstBase);
      writeFileSync(join(workspace, second), secondBase);
      writeFileSync(join(workspace, changed), "BeforeWorkspaceReview\n");
      runFixtureGit(workspace, "init", "-qb", "main");
      runFixtureGit(workspace, "add", "--", first, second, changed);
      runFixtureGit(workspace, "commit", "-qm", "Create IDE retention fixture");
      writeFileSync(join(workspace, changed), "AfterWorkspaceReview\n");

      const projectId = await makeProject(page, "IDE retention", workspace);
      await installProjectDialog(app, workspace);
      const sessionId = await openProjectChat(page, projectId);
      await app.evaluate(
        ({ dialog }, files) => {
          const original = dialog.showMessageBox;
          const originalSync = dialog.showMessageBoxSync;
          dialog.showMessageBox = (async (...args: unknown[]) => {
            const options = args.at(-1) as Electron.MessageBoxOptions;
            const save = options.buttons?.indexOf("Save changes") ?? -1;
            if (
              options.title === "Save workspace file?" &&
              files.includes(options.message ?? "") &&
              save >= 0
            ) {
              return { response: save, checkboxChecked: false };
            }
            return Reflect.apply(original, dialog, args);
          }) as typeof dialog.showMessageBox;
          // The isolated fixture can close cleanly after a failed assertion
          // even if its test edits are still unsaved.
          dialog.showMessageBoxSync = ((...args: unknown[]) => {
            const options = args.at(-1) as Electron.MessageBoxSyncOptions;
            const leave = options.buttons?.indexOf("Leave") ?? -1;
            if (options.title === "Unsaved coding changes" && leave >= 0)
              return leave;
            return Reflect.apply(originalSync, dialog, args);
          }) as typeof dialog.showMessageBoxSync;
        },
        [first, second],
      );

      const viewSwitcher = page.getByRole("group", { name: "Workbench view" });
      const chat = viewSwitcher.getByRole("button", { name: "Agent View" });
      const ideView = viewSwitcher.getByRole("button", { name: "IDE View" });
      const composer = page.getByRole("textbox", { name: "Message Doolittle" });
      const ide = page.locator('[data-view="code"]');
      const tree = ide.getByRole("tree", { name: "Workspace files" });
      const sourceFolder = tree.getByRole("treeitem", {
        name: "src",
        exact: true,
      });
      const tabs = ide.getByRole("tablist", { name: "Open editors" });
      const editInput = (path: string) =>
        ide.getByRole("textbox", { name: `Edit ${path}` });
      const editorText = ide.locator(".monaco-editor .view-lines");
      const edit = async (path: string, content: string, marker: string) => {
        await editInput(path).focus();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.insertText(content);
        await expect(editorText).toContainText(marker);
      };
      const terminal = page.getByRole("region", {
        name: "Chat terminal panel",
      });
      const terminalTab = terminal.getByRole("tab", { selected: true });
      const writeShellProof = async (file: string, command: string) => {
        await terminal.locator(".xterm-helper-textarea").focus();
        await page.keyboard.insertText(command);
        await page.keyboard.press("Enter");
        const proof = join(workspace, file);
        await expect
          .poll(() => (existsSync(proof) ? readFileSync(proof, "utf8") : ""))
          .toContain("retained-shell");
        return readFileSync(proof, "utf8");
      };

      await expect(composer).toBeEditable();
      await composer.fill(chatDraft);
      await ideView.click();
      await expect(ide).toBeVisible();
      await sourceFolder.focus();
      await sourceFolder.press("ArrowRight");
      await expect(sourceFolder).toHaveAttribute("aria-expanded", "true");
      await tree
        .getByRole("treeitem", { name: "engine.ts", exact: true })
        .click();
      await expect(editorText).toContainText("originalEngine");
      await edit(first, firstEdit, "retainedEngine");

      await tree
        .getByRole("treeitem", { name: "helpers.ts", exact: true })
        .click();
      await expect(editorText).toContainText("originalHelper");
      await edit(second, secondEdit, "retainedHelper");
      const engineTab = tabs.getByRole("tab", { name: /engine\.ts/u });
      const helperTab = tabs.getByRole("tab", { name: /helpers\.ts/u });
      await expect(engineTab).toBeVisible();
      await expect(helperTab).toHaveAttribute("aria-selected", "true");
      expect(readFileSync(join(workspace, first), "utf8")).toBe(firstBase);
      expect(readFileSync(join(workspace, second), "utf8")).toBe(secondBase);

      await ide
        .getByRole("button", { name: "Terminal", exact: true })
        .press("Enter");
      await expect(terminal).toBeVisible();
      await expect(
        terminal.getByRole("button", { name: "Interrupt foreground process" }),
      ).toBeEnabled();
      const tabId = await terminalTab.getAttribute("id");
      expect(tabId).toBeTruthy();
      const proofCommand = (file: string) =>
        `printf '%s\\n' "$$" "$PWD" "$DOOLITTLE_IDE_FIXTURE" > "${file}"`;
      const before = await writeShellProof(
        "terminal-before.txt",
        `DOOLITTLE_IDE_FIXTURE=retained-shell; ${proofCommand("terminal-before.txt")}`,
      );
      expect(before.trim().split("\n")).toEqual([
        expect.stringMatching(/^\d+$/u),
        workspace,
        "retained-shell",
      ]);

      await chat.click();
      await expect(composer).toHaveValue(chatDraft);
      await expect(terminalTab).toHaveAttribute("id", tabId ?? "");
      await page
        .getByRole("button", { name: "Open settings", exact: true })
        .click();
      await expect(page.locator('[data-view="settings"]')).toBeVisible();
      await expect(terminal).toBeHidden();
      await page.getByRole("button", { name: /^Back to /u }).click();
      await expect(composer).toHaveValue(chatDraft);
      await ideView.click();
      await expect(ide).toBeVisible();
      await expect(helperTab).toHaveAttribute("aria-selected", "true");
      await expect(editorText).toContainText("retainedHelper");
      await expect(sourceFolder).toHaveAttribute("aria-expanded", "true");
      await expect(engineTab).toHaveAccessibleName(/Unsaved edits/u);
      await expect(helperTab).toHaveAccessibleName(/Unsaved edits/u);
      expect(readFileSync(join(workspace, first), "utf8")).toBe(firstBase);
      expect(readFileSync(join(workspace, second), "utf8")).toBe(secondBase);
      await expect(terminalTab).toHaveAttribute("id", tabId ?? "");
      expect(
        await writeShellProof(
          "terminal-after.txt",
          proofCommand("terminal-after.txt"),
        ),
      ).toBe(before);
      expect(
        await page.evaluate(() => window.doolittle.ui?.getSelection()),
      ).toMatchObject({ sessionId, projectId });

      await terminal.getByRole("button", { name: /^Hide terminal\b/u }).click();
      await expect(terminal).toBeHidden();
      await engineTab.click();
      await expect(editorText).toContainText("retainedEngine");
      await editInput(first).press("ControlOrMeta+s");
      await expect
        .poll(() => readFileSync(join(workspace, first), "utf8"))
        .toBe(firstEdit);
      await helperTab.click();
      await expect(editorText).toContainText("retainedHelper");
      await editInput(second).press("ControlOrMeta+s");
      await expect
        .poll(() => readFileSync(join(workspace, second), "utf8"))
        .toBe(secondEdit);

      await ide.getByRole("button", { name: "Tools", exact: true }).click();
      const tools = ide.getByRole("complementary", { name: "Workspace tools" });
      await tools.getByRole("tab", { name: /^Changes(?:\s+\d+)?$/u }).click();
      const changes = tools.getByRole("region", { name: "Changed files" });
      await changes.getByRole("button", { name: /README\.md/u }).click();
      const patch = ide.getByRole("region", { name: "File patch" });
      await expect(patch).toContainText("BeforeWorkspaceReview");
      await expect(patch).toContainText("AfterWorkspaceReview");
      const wrap = ide.getByRole("button", { name: "Wrap lines", exact: true });
      await wrap.click();
      await expect(wrap).toHaveAttribute("aria-pressed", "true");

      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(540, 740);
      });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(540);
      await ide.getByRole("button", { name: "Explorer", exact: true }).click();
      await expect(
        ide.getByRole("complementary", { name: "Workspace explorer" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(tree).toBeHidden();
      await expect(patch).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
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
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    const { app, page, workspace } = desktop;
    const file = "approval-fixture.txt";
    const path = join(workspace, file);
    const worktreePath = ".doolittle/worktrees/approval-fixture";
    try {
      runFixtureGit(workspace, "init", "-qb", "main");
      writeFileSync(path, "original content\n");
      runFixtureGit(workspace, "add", "--", file);
      runFixtureGit(workspace, "commit", "-qm", "Create fixture");
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
      const tools = page.getByRole("complementary", {
        name: "Workspace tools",
      });
      await tools.getByRole("tab", { name: /^Changes(?:\s+\d+)?$/u }).click();
      await tools.getByText("Git controls", { exact: true }).click();
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
      expect(
        runFixtureGit(workspace, "status", "--porcelain", "--", file),
      ).toBe("");
      await tools.getByRole("tab", { name: /^Worktrees(?:\s+\d+)?$/u }).click();
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
      const chooser = page.getByRole("dialog", {
        name: "Start a chat with Doolittle",
        exact: true,
      });
      await chooser
        .getByRole("combobox", { name: "Project for new chat" })
        .selectOption(projectId);
      await chooser
        .getByRole("button", { name: "Start chat with Doolittle", exact: true })
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
        .getByRole("button", { name: "Start chat with Doolittle", exact: true })
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
      const row = sidebar
        .getByRole("button", { name: "Stable sidebar marker", exact: true })
        .and(sidebar.locator('[aria-current="page"]'));
      await expect(row).toBeVisible();
      await expect
        .poll(async () => {
          const { summary } = await agentRequest<{
            summary: { title?: string };
          }>(
            page,
            `/sessions/summary?sessionId=${encodeURIComponent(sessionId)}`,
          );
          return summary.title;
        })
        .toBe("Stable sidebar marker");
      const beforeBox = await row.boundingBox();
      const before = await page.evaluate(() => {
        const ui = window.doolittle.ui;
        if (!ui) throw new Error("Native UI bridge unavailable");
        return ui.getSnapshot();
      });
      expect(before.selected?.sessionId).toBe(sessionId);
      await page.evaluate(() => {
        const history = document.querySelector(
          'nav[aria-label="Chat history"]',
        );
        const current = history?.querySelector('[aria-current="page"]');
        if (!history || !current)
          throw new Error("Selected sidebar row is unavailable");
        const state = { removedRows: 0 };
        const observer = new MutationObserver(() => {
          const row = history.querySelector('[aria-current="page"]');
          if (row !== current || !current.isConnected) state.removedRows++;
        });
        observer.observe(history, { childList: true, subtree: true });
        Object.assign(window, { __freshSidebarObservation: state });
      });
      // A main-process API update emits no renderer catalog-change event. Seeing
      // both names proves two real periodic reads without modifying frozen IPC.
      await sidebarChatScope(page).click();
      for (const name of ["Poll witness first", "Poll witness second"]) {
        await agentRequest(page, `/bots/${pulse.id}`, "PATCH", { name });
        await expect(
          page.getByRole("menuitemradio", { name, exact: true }),
        ).toBeVisible({ timeout: 15_000 });
      }
      await page.keyboard.press("Escape");
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
  test("switches expressive themes without losing chat state or readability", async () => {
    test.setTimeout(120_000);
    const desktop = await launchDesktop(
      process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined,
    );
    try {
      let page = desktop.page;
      const composer = () => page.getByRole("textbox", { name: /^Message /u });
      const draft = "Keep this coding draft while I change the theme.";
      const chooseTheme = async (name: string) => {
        await page
          .getByRole("button", { name: "Open settings", exact: true })
          .click();
        await page
          .getByRole("button", { name: new RegExp(`^${name}:`, "u") })
          .click();
      };
      const returnToChat = () =>
        page.getByRole("button", { name: /^Back to /u }).click();
      const themes = [
        ["Anime Atelier", "anime-atelier", "cel"],
        ["Golden Gate Glass", "golden-gate-glass", "glass"],
      ] as const;
      const appearanceChoices = [
        ["light", "Light"],
        ["dark", "Dark"],
      ] as const;
      await composer().fill(draft);
      for (const [name, id, material] of themes) {
        await chooseTheme(name);
        await expect(page.locator("html")).toHaveAttribute("data-theme", id);
        await expect(page.locator("html")).toHaveAttribute(
          "data-ui-material",
          material,
        );
        for (const [appearance, label] of appearanceChoices) {
          await page
            .getByRole("button", {
              name: `${label}: ${label} surfaces`,
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
        }
        await returnToChat();
        await expect(composer()).toHaveValue(draft);
        await page.locator(".chat-welcome-starter").first().click();
        await expect(composer()).toHaveValue("Help me think something through");
        await composer().fill(draft);
      }

      await composer().fill(
        "Reference snippet:\n```ts\nexport const greeting = 'Hello, Doolittle';\n```",
      );
      await composer().press("Enter");
      const messages = page.locator(".chat-message.user");
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
      const getSelection = () =>
        page.evaluate(() => window.doolittle.ui?.getSelection());
      const selected = await getSelection();
      expect(selected).toBeTruthy();
      for (const [name] of themes) {
        await chooseTheme(name);
        await page
          .getByRole("button", { name: "Light: Light surfaces", exact: true })
          .click();
        await returnToChat();
        expect(await getSelection()).toEqual(selected);
        await expect(messages).toHaveCount(1);
        await expect(messages.locator("pre")).toContainText("Hello, Doolittle");
        await expectQuietFocus(composer());
      }
      await composer().fill(draft);
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
      await expect(page.locator("html")).toHaveAttribute(
        "data-appearance",
        "light",
      );
      await expect(composer()).toHaveValue(draft);
      await expect(page.locator(".chat-message.user pre")).toContainText(
        "Hello, Doolittle",
      );
      await desktop.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(520, 780);
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expectQuietFocus(composer());
      await desktop.app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(520, 430);
      });
      await expect(composer()).toBeInViewport({ ratio: 1 });
      await page.emulateMedia({ forcedColors: "active" });
      await expect(page.locator(".chat-composer")).toHaveCSS(
        "backdrop-filter",
        "none",
      );
    } finally {
      await desktop.dispose();
    }
  });
});
