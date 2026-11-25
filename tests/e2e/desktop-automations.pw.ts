import { createServer } from "node:http";
import type {
  AutomationJobRecord,
  AutomationRunRecord,
} from "@doolittle/contracts";
import { expect, test } from "@playwright/test";
import {
  agentRequest,
  chooseSidebarChatScope,
  installProjectDialog,
  launchDesktop,
  makeProject,
} from "../support/desktop-core";

test("automation schedules can be edited, paused, run, and deleted", async () => {
  test.setTimeout(90_000);
  const deliveries: unknown[] = [];
  const sink = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    deliveries.push(JSON.parse(body));
    response.writeHead(200).end("Fixture delivery accepted.");
  });
  await new Promise<void>((resolve) => sink.listen(0, "127.0.0.1", resolve));
  const address = sink.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture HTTP listener did not start.");
  let desktop: Awaited<ReturnType<typeof launchDesktop>> | undefined;
  try {
    desktop = await launchDesktop();
    const { page } = desktop;
    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("button", { name: "Automations", exact: true })
      .click();
    await page
      .getByRole("button", { name: "New automation", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Fixture schedule");
    await page
      .getByRole("textbox", { name: "Schedule", exact: true })
      .fill("every 2h");
    await page
      .getByRole("group", { name: "Choose an action" })
      .getByRole("radio", { name: "Webhook", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Destination URL" })
      .fill(`http://127.0.0.1:${address.port}/receipt`);
    await page.getByRole("button", { name: "Create automation" }).click();
    const first = page
      .getByRole("article")
      .filter({ hasText: "Fixture schedule" });
    await expect(first).toBeVisible();
    const {
      jobs: [initial],
    } = await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs");
    expect(initial).toMatchObject({
      name: "Fixture schedule",
      schedule: "every 2h",
      status: "active",
    });

    await first.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(first.getByRole("button", { name: "Run now" })).toBeDisabled();
    await first.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Edit automation" }),
    ).toBeVisible();
    const nameInput = page.getByRole("textbox", { name: "Name", exact: true });
    await expect(nameInput).toBeFocused();
    await expect(nameInput).toHaveValue("Fixture schedule");
    await expect(page.getByRole("combobox", { name: "Run as" })).toBeDisabled();
    await nameInput.fill("Edited fixture schedule");
    await page
      .getByRole("textbox", { name: "Schedule", exact: true })
      .fill("every 3h");
    await page.getByRole("button", { name: "Save changes" }).click();
    const edited = page
      .getByRole("article")
      .filter({ hasText: "Edited fixture schedule" });
    await expect(edited).toBeVisible();
    const {
      jobs: [updated],
    } = await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs");
    expect(updated).toMatchObject({
      id: initial.id,
      schedule: "every 3h",
      status: "paused",
      action: initial.action,
    });

    await edited.getByRole("button", { name: "Resume", exact: true }).click();
    await edited.getByRole("button", { name: "Run now", exact: true }).click();
    await expect(
      page.getByText("Automation completed. The trace is ready."),
    ).toBeVisible();
    expect(deliveries).toMatchObject([
      {
        automation: { id: initial.id, name: "Edited fixture schedule" },
        trigger: "manual",
      },
    ]);
    await page.getByText("Run history", { exact: true }).click();
    await expect(
      page
        .getByRole("list", { name: "Automation runs" })
        .getByText("Edited fixture schedule"),
    ).toBeVisible();
    const { runs } = await agentRequest<{ runs: AutomationRunRecord[] }>(
      page,
      "/cron/runs",
    );
    expect(runs[0]).toMatchObject({
      jobId: initial.id,
      status: "completed",
      output: "Fixture delivery accepted.",
    });
    expect(runs[0].trace?.map((step) => step.phase)).toEqual(
      expect.arrayContaining(["trigger", "condition", "action", "delivery"]),
    );

    await edited.getByRole("button", { name: "Delete", exact: true }).click();
    await edited.getByRole("button", { name: "Confirm delete" }).click();
    await expect(edited).toBeHidden();
    expect(
      (await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs"))
        .jobs,
    ).toEqual([]);
    expect(
      (await agentRequest<{ runs: AutomationRunRecord[] }>(page, "/cron/runs"))
        .runs[0].jobId,
    ).toBe(initial.id);
  } finally {
    try {
      await desktop?.dispose();
    } finally {
      await new Promise<void>((resolve, reject) =>
        sink.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }
});

test("delegation unlocks after confirming a Lead workspace chat and applies bulk changes", async () => {
  test.setTimeout(90_000);
  const desktop = await launchDesktop();
  try {
    const { app, page, workspace } = desktop;
    const projectId = await makeProject(page, "Delegation fixture", workspace);
    const { defaultBotId } = await agentRequest<{ defaultBotId: string }>(
      page,
      "/bots",
    );
    const botName = "Delegation fixture bot";
    await agentRequest(page, "/bots", "POST", {
      name: botName,
      persona: "Offline delegation journey fixture.",
      model: { provider: "offline", model: "offline" },
    });
    await page.evaluate(() =>
      window.dispatchEvent(new Event("doolittle:bot-catalog-changed")),
    );
    await chooseSidebarChatScope(page, botName);
    const openWork = () =>
      page
        .getByRole("navigation", { name: "Workspace navigation" })
        .getByRole("button", { name: "Work", exact: true })
        .click();
    await openWork();
    const newTask = page.getByRole("button", { name: "New task", exact: true });
    await expect(newTask).toBeDisabled();
    await installProjectDialog(app, workspace);
    await page.getByRole("button", { name: "Open a Lead chat" }).click();
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
    await expect(chooser).toBeHidden();
    const selected = await page.evaluate(() =>
      window.doolittle.ui?.getSelection(),
    );
    expect(selected?.botId).toBe(defaultBotId);
    await openWork();
    await expect(newTask).toBeEnabled();
    for (const title of ["First fixture research", "Second fixture research"]) {
      await newTask.click();
      await page
        .getByRole("combobox", { name: "Task work type" })
        .selectOption("research");
      await page
        .getByRole("textbox", { name: "Title", exact: true })
        .fill(title);
      await page
        .getByRole("textbox", { name: "Objective", exact: true })
        .fill("Inspect local fixture state.");
      await page.getByRole("button", { name: "Create research task" }).click();
      await expect(
        page.getByText("Task created.", { exact: true }).last(),
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole("button", { name: "Create research task" }),
      ).toBeHidden();
    }
    await page
      .getByRole("button", { name: "Cancel filtered", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm cancel", exact: true })
      .click();
    await expect(page.getByText("Cancel applied to 2 tasks.")).toBeVisible();
  } finally {
    await desktop.dispose();
  }
});

test("named automation creation and edits require fresh native approval", async () => {
  test.setTimeout(90_000);
  const desktop = await launchDesktop();
  try {
    const { app, page } = desktop;
    const bot = await agentRequest<{ id: string }>(page, "/bots", "POST", {
      name: "Scheduler fixture bot",
      persona: "Offline fixture.",
      model: { provider: "offline", model: "offline" },
    });
    await app.evaluate(({ dialog }) => {
      const original = dialog.showMessageBox;
      let create = 0;
      let edit = 0;
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as Electron.MessageBoxOptions;
        if (
          options.title === "Create named automation?" ||
          options.title === "Approve named automation changes?"
        ) {
          if (
            !options.message?.includes("Scheduler fixture bot") ||
            options.defaultId !== options.cancelId ||
            options.buttons?.[1] !== "Cancel"
          )
            throw new Error("Unexpected automation approval dialog.");
          const count =
            options.title === "Create named automation?" ? create++ : edit++;
          return { response: count === 0 ? 1 : 0, checkboxChecked: false };
        }
        return Reflect.apply(original, dialog, args);
      }) as typeof dialog.showMessageBox;
    });
    await page
      .getByRole("navigation", { name: "Workspace navigation" })
      .getByRole("button", { name: "Automations", exact: true })
      .click();
    await page
      .getByRole("button", { name: "New automation", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Named fixture");
    await page.getByRole("combobox", { name: "Run as" }).selectOption(bot.id);
    await page
      .getByRole("group", { name: "Choose a trigger" })
      .getByRole("radio", { name: "Manual", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Prompt" })
      .fill("Review the fixture when run.");
    const create = page.getByRole("button", { name: "Create automation" });
    await create.click();
    await expect(
      page.getByText("Automation approval was cancelled.", { exact: true }),
    ).toBeVisible();
    expect(
      (await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs"))
        .jobs,
    ).toEqual([]);
    await create.click();
    const card = page.getByRole("article").filter({ hasText: "Named fixture" });
    await expect(card).toBeVisible();
    const {
      jobs: [initial],
    } = await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs");
    expect(initial).toMatchObject({
      targetBotId: bot.id,
      targetApprovalId: expect.any(String),
    });

    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Named renewal");
    const save = page.getByRole("button", { name: "Save changes" });
    await save.click();
    await expect(
      page.getByText("Automation approval was cancelled.", { exact: true }),
    ).toBeVisible();
    expect(
      (await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs"))
        .jobs[0],
    ).toMatchObject({
      id: initial.id,
      name: "Named fixture",
      targetApprovalId: initial.targetApprovalId,
    });
    await save.click();
    await expect(
      page.getByRole("article").filter({ hasText: "Named renewal" }),
    ).toBeVisible();
    const {
      jobs: [saved],
    } = await agentRequest<{ jobs: AutomationJobRecord[] }>(page, "/cron/jobs");
    expect(saved).toMatchObject({
      id: initial.id,
      targetBotId: bot.id,
      name: "Named renewal",
    });
    expect(saved.targetApprovalId).not.toBe(initial.targetApprovalId);
  } finally {
    await desktop.dispose();
  }
});
