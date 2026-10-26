import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { createEvalRuntimeEnvironment } from "../../packages/evals/src/runtime-environment";
import {
  agentRequest,
  installProjectDialog,
  launchDesktop,
  makeProject,
  openProjectChat,
} from "../support/desktop-core";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";
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
test("CLI repairs a project with the real linked Codex provider", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "doolittle-live-cli-")));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  mkdirSync(join(root, "data"));
  const prompt = seedLiveCodingProject(workspace);
  writeFileSync(join(root, "data/onboarding.json"), "{}\n");
  writeFileSync(
    join(root, "data/settings.json"),
    JSON.stringify({
      model: {
        provider: "codex",
        model: "gpt-6-luna",
        reasoningEffort: "medium",
        baseUrl: "https://chatgpt.com/backend-api/codex",
        maxTokens: 8192,
      },
    }),
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
test("desktop chat repairs a project through ElizaOS with real linked Codex", async () => {
  const desktop = await launchDesktop(undefined, { liveCoding: true });
  let passed = false;
  try {
    const prompt = seedLiveCodingProject(desktop.workspace);
    const projectId = await makeProject(
      desktop.page,
      "Live coding acceptance",
      desktop.workspace,
    );
    await installProjectDialog(desktop.app, desktop.workspace);
    const sessionId = await openProjectChat(desktop.page, projectId);
    const composer = desktop.page.getByRole("textbox", {
      name: "Message Doolittle",
    });
    await composer.fill(prompt);
    await composer.press("Enter");
    const catalog = await agentRequest<{
      bots: { id: string; name: string }[];
    }>(desktop.page, "/bots");
    const bot = catalog.bots.find(
      (candidate) => candidate.name === "Doolittle",
    );
    expect(bot).toBeTruthy();
    let status = "pending";
    await expect
      .poll(
        async () => {
          const { runs } = await agentRequest<{
            runs: { sessionId: string; status: string }[];
          }>(desktop.page, "/chat/runs", "GET", undefined, bot?.id);
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
    expect(await agentRequest(desktop.page, "/runtime/status")).toBeTruthy();
    await test.info().attach("independent-verification", {
      body: JSON.stringify({
        ...summary,
        sessionCreated: Boolean(sessionId),
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
