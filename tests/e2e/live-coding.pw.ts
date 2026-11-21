import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { CommandResult } from "@doolittle/contracts";
import { expect, test } from "@playwright/test";
import { createEvalRuntimeEnvironment } from "../../packages/evals/src/runtime-environment";
import {
  agentRequest,
  installProjectDialog,
  launchDesktop,
} from "../support/desktop-core";
import {
  isolatedRuntimeEnvironment,
  liveCodexModel,
} from "../support/isolated-runtime-environment";
import {
  seedLiveCodingProject,
  verifyLiveCodingProject,
} from "../support/live-coding";

const execute = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");
test.beforeAll(() => {
  if (process.env.DOOLITTLE_RUN_LIVE_CODING !== "true")
    throw new Error("Explicit live coding opt-in is required.");
});
test("CLI repairs Doolittle code with the real linked Codex provider", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doolittle-live-cli-")));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  mkdirSync(join(root, "data"));
  const prompt = seedLiveCodingProject(workspace);
  writeFileSync(join(root, "data/onboarding.json"), "{}\n");
  writeFileSync(
    join(root, "data/settings.json"),
    JSON.stringify({ model: liveCodexModel() }),
  );
  const env = createEvalRuntimeEnvironment({
    repoRoot,
    root,
    workspaceDir: workspace,
    mode: "cli",
    baseEnvironment: {
      ...isolatedRuntimeEnvironment(join(root, "data")),
      HOME: homedir(),
      USERPROFILE: homedir(),
      DOOLITTLE_OFFLINE_BOOTSTRAP: "false",
      DOOLITTLE_USE_LINKED_CODEX_AUTH: "true",
    },
  });
  let passed = false;
  try {
    const result = await execute(
      process.execPath,
      [
        join(repoRoot, "apps/cli/dist/index.js"),
        "exec",
        "-p",
        prompt,
        "--json-stream",
      ],
      { cwd: workspace, env, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const summary = verifyLiveCodingProject(workspace);
    const events = result.stdout.split("\n").flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    expect(events.find((event) => event.type === "completed")?.status).toBe(
      "completed",
    );
    expect(
      events.some((event) => event.runEventType === "action-completed"),
    ).toBe(true);
    await test.info().attach("independent-verification", {
      body: JSON.stringify(summary),
      contentType: "application/json",
    });
    passed = true;
  } finally {
    if (passed) rmSync(root, { recursive: true, force: true });
    else console.error(`Live CLI fixture retained: ${root}`);
  }
});
test("desktop chat repairs Doolittle code through ElizaOS with real linked Codex", async () => {
  const executable =
    process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined;
  const desktop = await launchDesktop(executable, { liveCoding: true });
  let passed = false;
  try {
    const { app, page, workspace } = desktop;
    const prompt = seedLiveCodingProject(workspace, {
      copyRepository: Boolean(executable),
    });
    await installProjectDialog(app, workspace);
    await app.evaluate(({ dialog }, fixtureRoot) => {
      dialog.showOpenDialog = (async (...args) => {
        const options = args.at(-1) as Electron.OpenDialogOptions;
        if (options.title !== "Choose a local folder for this chat")
          throw new Error("Expected the This computer folder picker.");
        return { canceled: false, filePaths: [fixtureRoot] };
      }) as typeof dialog.showOpenDialog;
    }, workspace);
    const picker = page.getByRole("button", { name: /^Choose workspace\./u });
    await picker.click();
    await page
      .getByRole("dialog", { name: "Choose a workspace for a new chat" })
      .getByRole("button", { name: /^Choose local folder/u })
      .click();
    await expect(picker).toHaveAccessibleName(
      /Current workspace This computer/u,
    );
    await expect(picker).toHaveAttribute("title", workspace);
    const selection = await page.evaluate(() =>
      window.doolittle.ui?.getSelection(),
    );
    if (!selection?.projectId)
      throw new Error("The live coding chat has no confirmed project.");
    const { sessionId, botId } = selection;
    const composer = page.getByRole("textbox", {
      name: "Message Doolittle",
    });
    await composer.fill(prompt);
    await expect(
      page.getByRole("button", { name: "Send message" }),
    ).toBeEnabled({ timeout: 30_000 });
    await composer.press("Enter");
    let status = "pending";
    await expect
      .poll(
        async () => {
          const { runs } = await agentRequest<{
            runs: { sessionId: string; status: string }[];
          }>(page, "/chat/runs", "GET", undefined, botId);
          status =
            runs.find((run) => run.sessionId === sessionId)?.status ??
            "pending";
          return ["complete", "error", "cancelled"].includes(status);
        },
        { timeout: 300_000, intervals: [1000, 3000] },
      )
      .toBe(true);
    expect(status).toBe("complete");
    const summary = verifyLiveCodingProject(desktop.workspace);
    const providerCalls = readJsonLines<{
      provider: string;
      completed: boolean;
    }>(join(desktop.profile, "runtime/eval-model-calls.jsonl")).filter(
      (call) => call.provider === "codex" && call.completed,
    );
    expect(providerCalls.length).toBeGreaterThan(0);
    const completedTurn = readJsonLines<{
      event: string;
      sessionId: string;
      model: string;
      metadata?: { commandResults?: CommandResult[] };
    }>(
      join(desktop.profile, "runtime/trajectories/trajectory-events.jsonl"),
    ).find(
      (event) =>
        event.event === "turn.completed" && event.sessionId === sessionId,
    );
    expect(completedTurn?.metadata?.commandResults).toContainEqual(
      expect.objectContaining({ command: "nub run test:scope", exitCode: 0 }),
    );
    await test.info().attach("independent-verification", {
      body: JSON.stringify({
        ...summary,
        model: completedTurn?.model,
        completedProviderCalls: providerCalls.length,
        verificationCommand: "nub run test:scope",
      }),
      contentType: "application/json",
    });
    passed = true;
  } finally {
    if (passed) await desktop.dispose();
    else {
      await desktop.close();
      console.error(`Live desktop fixture retained: ${desktop.profile}`);
    }
  }
});

function readJsonLines<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
