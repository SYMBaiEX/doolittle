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
import type {
  CommandResult,
  TerminalCommandRecord,
} from "@doolittle/contracts";
import { expect, test } from "@playwright/test";
import { parseCliTurnEvent } from "../../apps/cli/src/cli/turn-events";
import type { DelegatedExecutionReceipt } from "../../packages/agent/src/runtime/native/coding-delegation/types";
import { inspectWorkspaceCommands } from "../../packages/agent/src/utils/workspace-commands";
import { createEvalRuntimeEnvironment } from "../../packages/evals/src/runtime-environment";
import {
  agentRequest,
  type DesktopFixture,
  installProjectDialog,
  launchDesktop,
  projectDialogCount,
} from "../support/desktop-core";
import {
  isolatedRuntimeEnvironment,
  liveCodexModel,
} from "../support/isolated-runtime-environment";
import {
  seedLiveCodingProject,
  verifyLiveCodingProject,
} from "../support/live-coding";
import {
  measurePglite,
  prepareMultifileCodingWorkspace,
  summarizeVitestOutput,
  verifyFullSuite,
} from "../support/live-multifile-coding";

const execute = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");
test.beforeAll(() => {
  if (process.env.DOOLITTLE_RUN_LIVE_CODING !== "true")
    throw new Error("Explicit live coding opt-in is required.");
});
test("CLI repairs Doolittle code with the real linked Codex provider", () =>
  runCliCoding(false));

test("CLI delegates coding through native ACP", () => runCliCoding(true));

async function runCliCoding(delegated: boolean) {
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
      ELIZA_ACP_SESSION_STORE_BACKEND: "file",
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
        delegated ? delegateCodingPrompt(prompt) : prompt,
        "--json-stream",
      ],
      { cwd: workspace, env, timeout: 300_000, maxBuffer: 8 * 1024 * 1024 },
    );
    const summary = verifyLiveCodingProject(workspace);
    const events = result.stdout.split("\n").map(parseCliTurnEvent);
    expect(events.find((event) => event?.type === "completed")?.status).toBe(
      "completed",
    );
    expect(
      events.some(
        (event) =>
          event?.type === "run" && event.runEventType === "action-completed",
      ),
    ).toBe(true);
    let nativeAcp: ReturnType<typeof verifyNativeDelegation> | undefined;
    if (delegated) {
      const sessionId = events.find(
        (event) => event?.type === "start",
      )?.sessionId;
      if (!sessionId) throw new Error("The live CLI turn has no session ID.");
      const evidence = liveTurnEvidence(join(root, "data"), { sessionId });
      expectScopedVerification(evidence.completedTurn, workspace);
      nativeAcp = verifyNativeDelegation(
        evidence,
        join(root, "data", "plugin-acp"),
        workspace,
        summary.change,
      );
    }
    await test.info().attach("independent-verification", {
      body: JSON.stringify({ ...summary, ...(nativeAcp && { nativeAcp }) }),
      contentType: "application/json",
    });
    passed = true;
  } finally {
    if (passed) rmSync(root, { recursive: true, force: true });
    else console.error(`Live CLI fixture retained: ${root}`);
  }
}

test("desktop chat repairs Doolittle code through ElizaOS with real linked Codex", () =>
  runDesktopCoding(false));

test("desktop delegates coding through native ACP in an approved workspace", () =>
  runDesktopCoding(true));

async function runDesktopCoding(delegated: boolean) {
  const executable =
    process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim() || undefined;
  const desktop = await launchDesktop(executable, { liveCoding: true });
  let passed = false;
  try {
    const { workspace } = desktop;
    const prompt = seedLiveCodingProject(workspace, {
      copyRepository: !delegated && Boolean(executable),
    });
    const selection = await openLocalChat(desktop, workspace);
    const run = await runLiveTurn(
      desktop,
      selection,
      delegated ? delegateCodingPrompt(prompt) : prompt,
    );
    expect(run.status).toBe("complete");
    const summary = verifyLiveCodingProject(desktop.workspace);
    const evidence = liveTurnEvidence(join(desktop.profile, "runtime"), run);
    const { completedTurn, completedProviderCalls } = evidence;
    expectScopedVerification(completedTurn, workspace);
    const nativeAcp = delegated
      ? verifyNativeDelegation(
          evidence,
          join(desktop.profile, "runtime", "plugin-acp"),
          workspace,
          summary.change,
        )
      : undefined;
    await test.info().attach("independent-verification", {
      body: JSON.stringify({
        ...summary,
        model: completedTurn.model,
        completedProviderCalls,
        verificationCommand: "nub run test:scope",
        ...(nativeAcp && { nativeAcp }),
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
}

test("installed desktop cleans up multiple tests and runs the full suite", async () => {
  const workspace = process.env.DOOLITTLE_LIVE_CODING_WORKSPACE?.trim();
  test.skip(!workspace, "Requires a prepared disposable checkout.");
  const executable = process.env.DOOLITTLE_DESKTOP_EXECUTABLE?.trim();
  if (!workspace || !executable)
    throw new Error(
      "Select a prepared workspace and installed desktop executable.",
    );
  test.setTimeout(15 * 60_000);
  const task = prepareMultifileCodingWorkspace(repoRoot, workspace);
  const desktop = await launchDesktop(executable, { liveCoding: true });
  const baseline = measurePglite(desktop.profile);
  const database = { baseline, peak: { ...baseline } };
  // Allow for WAL recycling and filesystem allocation differences while
  // catching the previous multi-gigabyte growth during one turn.
  const storageGrowthLimit = 512 * 1024 * 1024;
  const runStatuses: string[] = [];
  let passed = false;
  try {
    expect(baseline.totalBytes).toBeGreaterThan(0);
    const selection = await openLocalChat(desktop, task.workspace);
    const run = await runLiveTurn(desktop, selection, task.prompt, {
      timeout: 10 * 60_000,
      observe(progress) {
        if (progress && runStatuses.at(-1) !== progress.status)
          runStatuses.push(progress.status);
        const sample = measurePglite(desktop.profile);
        database.peak.totalBytes = Math.max(
          database.peak.totalBytes,
          sample.totalBytes,
        );
        database.peak.walBytes = Math.max(
          database.peak.walBytes,
          sample.walBytes,
        );
        expect(
          database.peak.totalBytes - baseline.totalBytes,
          "A single coding turn exceeded the PGlite regression envelope.",
        ).toBeLessThan(storageGrowthLimit);
      },
    });
    expect(run.status).toBe("complete");
    const { completedTurn, completedProviderCalls, events } = liveTurnEvidence(
      join(desktop.profile, "runtime"),
      run,
    );
    const expectedCommand = {
      command: "nub run test",
      exitCode: 0,
      executedIn: task.workspace,
    };
    expect(
      completedTurn.metadata?.commandResults?.some(
        ({ command, exitCode, executedIn }) =>
          command === expectedCommand.command &&
          exitCode === expectedCommand.exitCode &&
          executedIn === expectedCommand.executedIn,
      ),
      "The completed turn must contain the scoped full suite receipt.",
    ).toBe(true);
    expect(
      events.some(
        ({ event, metadata }) =>
          event === "action.completed" &&
          metadata?.action === "TERMINAL_SHELL" &&
          metadata.commandResult?.command === expectedCommand.command &&
          metadata.commandResult.exitCode === 0,
      ),
      "The model must use ElizaOS's terminal action.",
    ).toBe(true);
    const history = JSON.parse(
      readFileSync(
        join(desktop.profile, "runtime/terminal/terminal-history.json"),
        "utf8",
      ),
    ) as { commands: TerminalCommandRecord[] };
    const command = [...history.commands]
      .reverse()
      .find((entry) => entry.command === expectedCommand.command);
    if (!command)
      throw new Error("The local terminal did not record the full suite.");
    const { cwd, backend, exitCode, timedOut, timeoutMs, durationMs } = command;
    expect({ cwd, backend, exitCode, timedOut }).toEqual({
      cwd: task.workspace,
      backend: "local",
      exitCode: 0,
      timedOut: false,
    });
    expect(timeoutMs).toBeGreaterThan(30_000);
    const changes = task.verify();
    const appSuite = summarizeVitestOutput(command.stdout);
    const independentSuite = await verifyFullSuite(
      task.workspace,
      desktop.profile,
    );
    expect(independentSuite).toEqual(appSuite);
    task.verify();
    await test.info().attach("independent-verification", {
      body: JSON.stringify({
        ...changes,
        model: completedTurn.model,
        completedProviderCalls,
        appSuite,
        independentSuite,
        durationMs,
        timeoutMs,
      }),
      contentType: "application/json",
    });
    console.log(
      `Live full suite: ${appSuite.tests} tests across ${appSuite.files} files in ${durationMs} ms (timeout ${timeoutMs} ms).`,
    );
    passed = true;
  } finally {
    const evidence = { database, runStatuses };
    try {
      await test.info().attach("desktop-runtime-evidence", {
        body: JSON.stringify(evidence),
        contentType: "application/json",
      });
      console.log(`Live runtime evidence: ${JSON.stringify(evidence)}`);
    } finally {
      if (passed) await desktop.dispose();
      else {
        await desktop.close();
        console.error(`Live desktop fixture retained: ${desktop.profile}`);
      }
    }
  }
});

async function openLocalChat(desktop: DesktopFixture, workspace: string) {
  const { app, page } = desktop;
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
  await expect(picker).toHaveAccessibleName(/Current workspace This computer/u);
  await expect(picker).toHaveAttribute("title", workspace);
  await expect.poll(() => projectDialogCount(app)).toBe(1);
  const selection = await page.evaluate(() =>
    window.doolittle.ui?.getSelection(),
  );
  if (!selection?.projectId)
    throw new Error("The live coding chat has no confirmed project.");
  return selection;
}

interface LiveRun {
  runId: string;
  sessionId: string;
  status: string;
}

async function runLiveTurn(
  { page }: DesktopFixture,
  { sessionId, botId }: Awaited<ReturnType<typeof openLocalChat>>,
  prompt: string,
  options: {
    timeout?: number;
    observe?: (progress: LiveRun | undefined) => void;
  } = {},
) {
  const composer = page.getByRole("textbox", { name: "Message Doolittle" });
  await composer.fill(prompt);
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled({
    timeout: 30_000,
  });
  await composer.press("Enter");
  let run: LiveRun | undefined;
  await expect
    .poll(
      async () => {
        const { runs } = await agentRequest<{ runs: LiveRun[] }>(
          page,
          "/chat/runs",
          "GET",
          undefined,
          botId,
        );
        const matching = runs.filter((entry) => entry.sessionId === sessionId);
        if (matching.length > 1)
          throw new Error("The live chat must produce exactly one run.");
        [run] = matching;
        options.observe?.(run);
        return run?.status ?? "pending";
      },
      { timeout: options.timeout ?? 300_000, intervals: [1_000, 3_000] },
    )
    .toMatch(/^(complete|error|cancelled)$/u);
  if (!run) throw new Error("The live chat never recorded a run.");
  return run;
}

function delegateCodingPrompt(prompt: string): string {
  return `${prompt} Use TASKS_SPAWN_AGENT to delegate the implementation to one Codex worker in this same workspace and wait for its result. Have that worker make the edit. After it returns, run nub run test:scope yourself from the approved workspace before reporting completion.`;
}

interface LiveTurnEvent {
  event: string;
  runId: string;
  sessionId: string;
  model: string;
  metadata?: {
    action?: string;
    commandResult?: CommandResult;
    commandResults?: CommandResult[];
    actionResult?: {
      success?: boolean;
      data?: {
        actionName?: string;
        delegatedExecution?: DelegatedExecutionReceipt;
      };
    };
  };
}

function expectScopedVerification(
  completedTurn: LiveTurnEvent,
  workspace: string,
) {
  const verification = completedTurn.metadata?.commandResults?.find(
    ({ command, exitCode, executedIn }) =>
      exitCode === 0 &&
      inspectWorkspaceCommands(command, executedIn).some(
        (operation) =>
          operation.runner === "nub" &&
          operation.kind === "verification" &&
          operation.script === "test:scope" &&
          operation.directory === workspace,
      ),
  );
  expect(
    verification,
    "verified Nub scoped tests in the selected workspace",
  ).toBeDefined();
}

function verifyNativeDelegation(
  {
    completedTurn,
    events,
    completedProviderCalls,
  }: ReturnType<typeof liveTurnEvidence>,
  sdkStateDirectory: string,
  workspace: string,
  change: ReturnType<typeof verifyLiveCodingProject>["change"],
) {
  const workers = events.flatMap(({ event, metadata }) => {
    const action = metadata?.actionResult;
    const receipt = action?.data?.delegatedExecution;
    const actionName = action?.data?.actionName ?? metadata?.action;
    return event === "action.completed" &&
      (actionName === "TASKS_SPAWN_AGENT" || actionName === "TASKS") &&
      action?.success === true &&
      receipt?.sessionId
      ? [receipt]
      : [];
  });
  const workerIds = [...new Set(workers.map(({ sessionId }) => sessionId))];
  expect(
    workerIds,
    "the run must complete exactly one delegated coding worker",
  ).toHaveLength(1);
  const worker = workers.at(-1);
  if (!worker)
    throw new Error("The turn has no completed delegated coding receipt.");
  expect({
    agentType: worker.agentType,
    workdir: worker.workdir,
    status: worker.status,
    stopReason: worker.stopReason,
    verifiedLocalMutation: worker.verifiedLocalMutation,
  }).toEqual({
    agentType: "codex",
    workdir: workspace,
    status: "completed",
    stopReason: "end_turn",
    verifiedLocalMutation: true,
  });
  expect([0, null]).toContain(worker.exitCode);
  const changes = worker.changedFiles ?? [];
  expect(changes).toHaveLength(1);
  const [workerChange] = changes;
  if (!workerChange) throw new Error("The worker has no verified file change.");
  expect({
    path: resolve(workspace, workerChange.path),
    beforeSha256: workerChange.beforeSha256,
    afterSha256: workerChange.afterSha256,
  }).toEqual({ ...change, path: resolve(workspace, change.path) });

  // The SDK session store corroborates the action's receipt. Parent prose and
  // successful direct edits alone cannot satisfy this test.
  const sessions = JSON.parse(
    readFileSync(join(sdkStateDirectory, "sessions.json"), "utf8"),
  ) as Array<{
    id: string;
    agentType: string;
    workdir: string;
    status: string;
    acpxSessionId?: string;
    agentSessionId?: string;
    metadata?: { transportMode?: string; doolittleParentRunId?: string };
  }>;
  const session = sessions.find(({ id }) => id === worker.sessionId);
  const nativeAcp = {
    sessionId: session?.id,
    agentType: session?.agentType,
    transport: session?.metadata?.transportMode,
    approvedWorkspace: session?.workdir === workspace,
    protocolSession: Boolean(session?.agentSessionId || session?.acpxSessionId),
    closed: session?.status === "stopped",
    parentRunId: session?.metadata?.doolittleParentRunId,
  };
  expect(nativeAcp).toEqual({
    sessionId: worker.sessionId,
    agentType: "codex",
    transport: "native",
    approvedWorkspace: true,
    protocolSession: true,
    closed: true,
    parentRunId: completedTurn.runId,
  });
  return { ...nativeAcp, model: completedTurn.model, completedProviderCalls };
}

function liveTurnEvidence(
  runtime: string,
  run: { sessionId: string; runId?: string },
) {
  const completedProviderCalls = readJsonLines<{
    provider: string;
    completed: boolean;
  }>(join(runtime, "eval-model-calls.jsonl")).filter(
    (call) => call.provider === "codex" && call.completed,
  ).length;
  expect(completedProviderCalls).toBeGreaterThan(0);
  const sessionEvents = readJsonLines<LiveTurnEvent>(
    join(runtime, "trajectories/trajectory-events.jsonl"),
  ).filter(
    (event) =>
      event.sessionId === run.sessionId &&
      (!run.runId || event.runId === run.runId),
  );
  const completedTurns = sessionEvents.filter(
    (event) => event.event === "turn.completed",
  );
  const [completedTurn] = completedTurns;
  if (!completedTurn || completedTurns.length !== 1)
    throw new Error("Expected one recorded live turn completion.");
  expect(completedTurn.model).toBe(liveCodexModel().model);
  return {
    completedTurn,
    completedProviderCalls,
    events: sessionEvents.filter(({ runId }) => runId === completedTurn.runId),
  };
}

function readJsonLines<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
