import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import { terminalAction } from "@elizaos/agent/actions/terminal";
import { describe, expect, it, vi } from "vitest";
import { acquireCliTerminalEndpoint } from "@/entrypoint/cli-terminal-endpoint";
import type { AppContext } from "@/runtime/bootstrap";
import { startApiServer, stopApiServer } from "@/server";
import type { RuntimeSettings } from "@/services/settings/runtime-settings";
import { shellQuote } from "@/services/terminal/execution/subprocess/shell";
import { TerminalService } from "@/services/terminal/service";
import { createSdkTerminalAction } from "./sdk-terminal-action";

const ENV_KEYS = [
  "ELIZA_API_BIND",
  "ELIZA_API_PORT",
  "ELIZA_API_TOKEN",
  "ELIZA_PORT",
  "ELIZA_RUNTIME_MODE",
  "ELIZA_TERMINAL_RUN_TOKEN",
  "ELIZA_UI_PORT",
] as const;

function restoreEnvironment(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function closedLoopbackPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error(
      "Could not allocate a loopback port for the no-endpoint control.",
    );
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function withDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  phase: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out during ${phase}.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function waitForPidFile(
  path: string,
  timeoutMs: number,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      const pid = Number(readFileSync(path, "utf8").trim());
      if (Number.isSafeInteger(pid) && pid > 0) return pid;
      throw new Error("The synthetic child start witness was invalid.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the synthetic child start witness.");
}

function exactProbeProcessIsAlive(pid: number, identity: string): boolean {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).includes(identity);
  } catch {
    return false;
  }
}

async function waitForExactProbeProcessExit(
  pid: number,
  identity: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!exactProbeProcessIsAlive(pid, identity)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return !exactProbeProcessIsAlive(pid, identity);
}

async function terminateExactProbeProcess(
  pid: number,
  identity: string,
): Promise<void> {
  if (!exactProbeProcessIsAlive(pid, identity)) return;
  process.kill(pid, "SIGTERM");
  if (await waitForExactProbeProcessExit(pid, identity, 1_500)) return;
  if (!exactProbeProcessIsAlive(pid, identity)) return;
  process.kill(pid, "SIGKILL");
  if (!(await waitForExactProbeProcessExit(pid, identity, 1_500))) {
    throw new Error("The exact synthetic child could not be reaped.");
  }
}

function makeSettings(
  backend: RuntimeSettings["execution"]["backend"] = "local",
): RuntimeSettings {
  return {
    execution: { backend, commandTimeoutMs: 10_000 },
  } as RuntimeSettings;
}

function commandFor(script: string): string {
  return `${shellQuote(process.execPath)} -e ${shellQuote(script)}`;
}

function makeContext(terminal: TerminalService, workspace: string): AppContext {
  // This fixture supplies SDK owner identity and the native shell service;
  // the pinned action, HTTP listeners/routes, TerminalService and subprocess
  // execution below are real.
  const agentId = "sdk-shell-probe-agent";
  const runtime = {
    agentId,
    getService: (name: string) =>
      name === DOOLITTLE_SHELL_SERVICE ? terminal : null,
    getSetting: () => undefined,
  };
  return {
    config: {
      host: "127.0.0.1",
      port: 0,
      agentName: "SDK shell integration probe",
      workspaceDir: workspace,
    },
    runtime,
    services: {
      terminal,
      logger: {
        captureError: vi.fn(() => ""),
        error: vi.fn(),
      },
    },
    gateway: {} as never,
    ensureDeferredHydration: async () => undefined,
  } as unknown as AppContext;
}

describe("pinned Eliza SHELL through Doolittle's native listener", () => {
  it.skipIf(process.platform === "win32")(
    "runs only through owned POSIX loopback routes and preserves native execution evidence",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-sdk-shell-probe-"));
      const workspace = join(root, "workspace");
      mkdirSync(workspace);
      const previousEnvironment = Object.fromEntries(
        ENV_KEYS.map((key) => [key, process.env[key]]),
      ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
      const privateApiToken = `shell-probe-api-${randomUUID()}`;
      const terminalToken = `shell-probe-${randomUUID()}`;
      const terminal = new TerminalService(
        join(root, "state"),
        workspace,
        makeSettings,
      );
      const observations: Array<{
        record: {
          id: string;
          command: string;
          backend: string;
          backendMode?: string;
          cwd: string;
          exitCode: number;
          stdout: string;
          stderr: string;
          timedOut?: boolean;
        };
        sandbox?: string;
      }> = [];
      const unsubscribe = terminal.onExecutionResult((observation) => {
        observations.push(observation);
      });
      const context = makeContext(terminal, workspace);
      const action = createSdkTerminalAction(context.services, terminalAction);
      const runtime = context.runtime;
      const message = {
        id: "sdk-shell-integration-probe",
        entityId: "sdk-shell-probe-agent",
        roomId: "sdk-shell-integration-room",
        content: { text: "Run this finite local verification command." },
      };
      let privateServer:
        | Awaited<ReturnType<typeof acquireCliTerminalEndpoint>>
        | undefined;

      const runAction = (command: string) =>
        action.handler(runtime, message, undefined, {
          parameters: { command },
        });
      const runIdFor = (result: Awaited<ReturnType<typeof runAction>>) => {
        const runId = result?.data?.runId;
        expect(typeof runId).toBe("string");
        return runId as string;
      };
      const observedRun = (runId: string) =>
        observations.find((observation) => observation.record.id === runId);

      try {
        process.env.ELIZA_RUNTIME_MODE = "local-yolo";
        process.env.ELIZA_TERMINAL_RUN_TOKEN = terminalToken;

        // The pinned SDK action must fail closed when no server owns its target
        // port; the native terminal service must not receive a command.
        process.env.ELIZA_PORT = String(await closedLoopbackPort());
        const noEndpoint = await runAction(commandFor("process.exit(0)"));
        expect(noEndpoint?.success).toBe(false);
        expect(terminal.recent(10)).toHaveLength(0);
        expect(observations).toHaveLength(0);

        // Baseline the public production listener with no inherited API bearer
        // token. This is separate from the terminal-only listener below.
        delete process.env.ELIZA_API_TOKEN;
        const publicAddress = await startApiServer(context);
        process.env.ELIZA_PORT = String(publicAddress.port);
        const baselineMarker = "DOOLITTLE_PUBLIC_SHELL_BASELINE_OK";
        const baselineCommand = commandFor(
          `if (2 + 2 !== 4) process.exit(41); process.stdout.write(${JSON.stringify(`${baselineMarker}\n`)});`,
        );
        const baseline = await runAction(baselineCommand);
        expect(baseline).toMatchObject({
          success: true,
          verifiedUserFacing: true,
          userFacingText: baselineMarker,
          data: { actionName: "SHELL", command: baselineCommand, exitCode: 0 },
        });
        const baselineObservation = observedRun(runIdFor(baseline));
        expect(baselineObservation).toMatchObject({
          record: {
            command: baselineCommand,
            backend: "local",
            backendMode: "local",
            cwd: workspace,
            exitCode: 0,
            stderr: "",
            timedOut: false,
          },
          sandbox: "host",
        });
        expect(baselineObservation?.record.stdout).toBe(baselineMarker);
        await stopApiServer();

        // The private listener is the final CLI path. Keep any inherited API
        // bearer token untouched: the SDK SHELL handler sends its dedicated
        // terminal capability, and this listener admits only the canonical route.
        restoreEnvironment({
          ...previousEnvironment,
          ELIZA_TERMINAL_RUN_TOKEN: terminalToken,
          ELIZA_RUNTIME_MODE: "local-yolo",
        });
        process.env.ELIZA_API_TOKEN = privateApiToken;
        privateServer = await acquireCliTerminalEndpoint(context);
        const privateToken = process.env.ELIZA_TERMINAL_RUN_TOKEN;
        expect(
          typeof privateToken === "string" &&
            privateToken.length === 64 &&
            privateToken !== terminalToken,
        ).toBe(true);
        const beforeRejectedRequests = terminal.recent(10).length;
        const rejectedRequest = (token?: string) =>
          fetch(`${privateServer?.address.url}/api/terminal/run`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              ...(token ? { "x-eliza-terminal-token": token } : {}),
            },
            body: JSON.stringify({
              clientId: "runtime-terminal-action",
              captureOutput: true,
              command: commandFor("process.exit(0)"),
              ...(token ? { terminalToken: token } : {}),
            }),
          });
        const missingToken = await rejectedRequest();
        const wrongToken = await rejectedRequest("not-the-owned-token");
        expect(missingToken.status).toBe(401);
        expect(wrongToken.status).toBe(401);
        await expect(missingToken.json()).resolves.toMatchObject({
          error: expect.stringContaining("Missing terminal token."),
        });
        await expect(wrongToken.json()).resolves.toEqual({
          error: "Invalid terminal token.",
        });
        expect(terminal.recent(10)).toHaveLength(beforeRejectedRequests);

        const marker = "DOOLITTLE_PRIVATE_SHELL_PROBE_OK";
        const command = commandFor(
          `if (6 * 7 !== 42) process.exit(42); process.stdout.write(${JSON.stringify(`${marker}\n`)});`,
        );
        const success = await runAction(command);
        expect(success).toMatchObject({
          success: true,
          verifiedUserFacing: true,
          userFacingText: marker,
          data: {
            actionName: "SHELL",
            command,
            exitCode: 0,
            truncated: false,
            executedIn: workspace,
          },
        });
        const successObservation = observedRun(runIdFor(success));
        expect(successObservation).toMatchObject({
          record: {
            command,
            backend: "local",
            backendMode: "local",
            cwd: workspace,
            exitCode: 0,
            timedOut: false,
          },
          sandbox: "host",
        });
        expect(successObservation?.record.stdout).toBe(marker);

        const failureCommand = commandFor(
          "process.stderr.write('synthetic nonzero probe'); process.exit(7);",
        );
        const failure = await runAction(failureCommand);
        expect(failure).toMatchObject({
          success: false,
          error: "SHELL_COMMAND_FAILED",
          data: { command: failureCommand, exitCode: 7 },
        });
        const failureObservation = observedRun(runIdFor(failure));
        expect(failureObservation).toMatchObject({
          record: {
            command: failureCommand,
            backend: "local",
            backendMode: "local",
            cwd: workspace,
            exitCode: 7,
            timedOut: false,
          },
          sandbox: "host",
        });

        const capCommand = commandFor(
          "process.stdout.write('x'.repeat(140 * 1024));",
        );
        const capped = await runAction(capCommand);
        expect(capped).toMatchObject({
          success: true,
          data: { command: capCommand, exitCode: 0, truncated: true },
        });
        const capObservation = observedRun(runIdFor(capped));
        expect(capObservation).toMatchObject({
          record: {
            command: capCommand,
            backend: "local",
            backendMode: "local",
            cwd: workspace,
            exitCode: 0,
            timedOut: false,
          },
          sandbox: "host",
        });
        expect(capObservation?.record.stdout.length).toBe(140 * 1024);
        expect(
          process.env.ELIZA_API_TOKEN === privateApiToken &&
            Boolean(process.env.ELIZA_API_TOKEN?.trim()),
        ).toBe(true);
      } finally {
        if (privateServer) await privateServer.close();
        await stopApiServer();
        unsubscribe();
        terminal.disposeInteractiveSessions();
        rmSync(root, { recursive: true, force: true });
        restoreEnvironment(previousEnvironment);
      }
    },
    30_000,
  );

  it.skipIf(process.platform === "win32")(
    "aborts and drains a real captured POSIX child when the owned CLI endpoint closes",
    async () => {
      const root = mkdtempSync(
        join(tmpdir(), "doolittle-sdk-shell-close-probe-"),
      );
      const workspace = join(root, "workspace");
      mkdirSync(workspace);
      const previousEnvironment = Object.fromEntries(
        ENV_KEYS.map((key) => [key, process.env[key]]),
      ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
      const privateApiToken = `shell-probe-close-api-${randomUUID()}`;
      const readyFile = join(root, "synthetic-child.pid");
      const childIdentity = `shell-close-${randomUUID()}`;
      const terminal = new TerminalService(
        join(root, "state"),
        workspace,
        makeSettings,
      );
      const context = makeContext(terminal, workspace);
      const action = createSdkTerminalAction(context.services, terminalAction);
      const observations: string[] = [];
      const unsubscribe = terminal.onExecutionResult((observation) => {
        observations.push(observation.record.command);
      });
      const message = {
        id: "sdk-shell-close-integration-probe",
        entityId: "sdk-shell-probe-agent",
        roomId: "sdk-shell-close-integration-room",
        content: {
          text: "Run a bounded local process for shutdown verification.",
        },
      };
      let endpoint:
        | Awaited<ReturnType<typeof acquireCliTerminalEndpoint>>
        | undefined;
      let endpointClosed = false;
      let capturedRequest: ReturnType<typeof action.handler> | undefined;
      let childPid: number | undefined;
      let childStoppedAfterCleanup = true;
      let actionStartedAt: number | undefined;

      try {
        process.env.ELIZA_RUNTIME_MODE = "local-yolo";
        process.env.ELIZA_API_TOKEN = privateApiToken;
        endpoint = await acquireCliTerminalEndpoint(context);
        const endpointUrl = endpoint.address.url;
        const longCommand = commandFor(
          `require('node:fs').writeFileSync(${JSON.stringify(readyFile)}, String(process.pid)); setTimeout(() => process.exit(0), 10000); void ${JSON.stringify(childIdentity)};`,
        );
        actionStartedAt = Date.now();
        capturedRequest = action.handler(context.runtime, message, undefined, {
          parameters: { command: longCommand },
        });

        childPid = await waitForPidFile(readyFile, 3_000);
        expect(exactProbeProcessIsAlive(childPid, childIdentity)).toBe(true);
        expect(observations.includes(longCommand)).toBe(false);

        await withDeadline(
          (async () => {
            await endpoint?.close();
            endpointClosed = true;
            const capturedResult = await capturedRequest;
            expect(capturedResult?.success === false).toBe(true);
            expect(
              await waitForExactProbeProcessExit(
                childPid as number,
                childIdentity,
                1_500,
              ),
            ).toBe(true);
          })(),
          5_000,
          "owned listener close, SDK request settlement, and child exit",
        );
        expect(Date.now() - (actionStartedAt as number)).toBeLessThan(8_000);
        expect(
          await fetch(`${endpointUrl}/api/terminal/run`).then(
            () => false,
            () => true,
          ),
        ).toBe(true);
        expect(process.env.ELIZA_API_TOKEN === privateApiToken).toBe(true);
      } finally {
        try {
          if (endpoint && !endpointClosed) {
            await withDeadline(
              endpoint.close(),
              10_000,
              "listener cleanup",
            ).catch(() => undefined);
          }
          if (capturedRequest) {
            await withDeadline(
              capturedRequest,
              10_000,
              "SDK request cleanup",
            ).catch(() => undefined);
          }
          if (childPid !== undefined) {
            await terminateExactProbeProcess(childPid, childIdentity);
            childStoppedAfterCleanup = await waitForExactProbeProcessExit(
              childPid,
              childIdentity,
              2_000,
            );
          }
        } finally {
          unsubscribe();
          terminal.disposeInteractiveSessions();
          rmSync(root, { recursive: true, force: true });
          restoreEnvironment(previousEnvironment);
        }
      }
      expect(childStoppedAfterCleanup).toBe(true);
    },
    40_000,
  );

  it.skipIf(process.platform === "win32")(
    "rejects captured POSIX SHELL before execution in local-safe mode or on a non-local backend",
    async () => {
      const root = mkdtempSync(
        join(tmpdir(), "doolittle-sdk-shell-capability-probe-"),
      );
      const workspace = join(root, "workspace");
      mkdirSync(workspace);
      const previousEnvironment = Object.fromEntries(
        ENV_KEYS.map((key) => [key, process.env[key]]),
      ) as Record<(typeof ENV_KEYS)[number], string | undefined>;
      const privateApiToken = `shell-probe-capability-api-${randomUUID()}`;
      let backend: RuntimeSettings["execution"]["backend"] = "local";
      const terminal = new TerminalService(join(root, "state"), workspace, () =>
        makeSettings(backend),
      );
      const context = makeContext(terminal, workspace);
      const action = createSdkTerminalAction(context.services, terminalAction);
      const message = {
        id: "sdk-shell-capability-integration-probe",
        entityId: "sdk-shell-probe-agent",
        roomId: "sdk-shell-capability-integration-room",
        content: { text: "Verify captured-command cancellation capability." },
      };
      const observedCommands: string[] = [];
      const unsubscribe = terminal.onExecutionResult((observation) => {
        observedCommands.push(observation.record.command);
      });
      let endpoint:
        | Awaited<ReturnType<typeof acquireCliTerminalEndpoint>>
        | undefined;

      try {
        process.env.ELIZA_API_TOKEN = privateApiToken;
        process.env.ELIZA_RUNTIME_MODE = "local-safe";
        endpoint = await acquireCliTerminalEndpoint(context);
        const endpointUrl = endpoint.address.url;
        const terminalToken = process.env.ELIZA_TERMINAL_RUN_TOKEN;
        expect(
          typeof terminalToken === "string" && terminalToken.length === 64,
        ).toBe(true);

        const assertUnavailableWithoutExecution = async (input: {
          mode: string;
          backend: RuntimeSettings["execution"]["backend"];
          label: string;
        }) => {
          process.env.ELIZA_RUNTIME_MODE = input.mode;
          backend = input.backend;
          const witness = join(root, `${input.label}.executed`);
          const command = commandFor(
            `require('node:fs').writeFileSync(${JSON.stringify(witness)}, 'executed');`,
          );
          const historyBefore = terminal.recent(100).length;
          const actionResult = await action.handler(
            context.runtime,
            message,
            undefined,
            { parameters: { command } },
          );
          expect(actionResult?.success === false).toBe(true);

          const response = await fetch(`${endpointUrl}/api/terminal/run`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-eliza-terminal-token": terminalToken as string,
            },
            body: JSON.stringify({
              clientId: "runtime-terminal-action",
              terminalToken,
              captureOutput: true,
              command,
            }),
          });
          const payload = (await response.json()) as { error?: unknown };
          expect(response.status).toBe(501);
          expect(
            typeof payload.error === "string" &&
              payload.error.includes("cancellation is unavailable") &&
              payload.error.includes("execution policy was not changed"),
          ).toBe(true);
          expect(existsSync(witness)).toBe(false);
          expect(terminal.recent(100).length === historyBefore).toBe(true);
          expect(observedCommands.includes(command)).toBe(false);
        };

        await assertUnavailableWithoutExecution({
          mode: "local-safe",
          backend: "local",
          label: "safe-mode",
        });
        await assertUnavailableWithoutExecution({
          mode: "local-yolo",
          backend: "ssh",
          label: "non-local-backend",
        });
        expect(process.env.ELIZA_API_TOKEN === privateApiToken).toBe(true);
      } finally {
        if (endpoint) await endpoint.close();
        unsubscribe();
        terminal.disposeInteractiveSessions();
        rmSync(root, { recursive: true, force: true });
        restoreEnvironment(previousEnvironment);
      }
    },
    30_000,
  );
});
