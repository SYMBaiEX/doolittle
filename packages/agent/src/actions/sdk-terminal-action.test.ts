import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import { terminalAction } from "@elizaos/agent/actions/terminal";
import type {
  Action,
  ActionResult,
  IAgentRuntime,
  Memory,
} from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import {
  getScopedTurnActionResults,
  runWithTurnRuntimeScope,
} from "@/runtime/turn-runtime-scope";
import { handleOperationsRoutes } from "@/server/routes/operations";
import type { AppServices } from "@/services";
import { serveFetchTest } from "@/testing/fetch-server";
import { createSdkTerminalAction } from "./sdk-terminal-action";

function fixture(input: { preflight?: string; result?: ActionResult }) {
  const sdkHandler = vi.fn(async () => input.result);
  const sdkAction = {
    name: "SHELL",
    description: "Official shell action",
    handler: sdkHandler,
  } as unknown as Action;
  const services = {
    terminal: {
      preflightProductionBuild: vi.fn(() => input.preflight),
    },
  } as unknown as AppServices;
  const runtime = { getSetting: () => undefined } as unknown as IAgentRuntime;
  const message = {
    roomId: "chat-a",
    content: { text: "Run a command" },
  } as Memory;
  return {
    action: createSdkTerminalAction(services, sdkAction),
    message,
    runtime,
    sdkHandler,
  };
}

describe("Doolittle's Eliza SDK terminal adapter", () => {
  it("preserves an actionable failure when a managed server blocks a build", async () => {
    const { action, message, runtime, sdkHandler } = fixture({
      preflight: "Stop the managed dev server before building this workspace.",
    });
    const result = await runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      async () => {
        const response = await action.handler(runtime, message, undefined, {
          parameters: { command: "cd /workspace/blog && bun run build" },
        });
        return { response, actions: getScopedTurnActionResults(runtime) };
      },
    );

    expect(result.response).toMatchObject({
      success: false,
      error: "WORKSPACE_BUILD_CONFLICT",
      text: expect.stringContaining("Stop the managed dev server"),
    });
    expect(result.actions).toContainEqual(result.response);
    expect(sdkHandler).not.toHaveBeenCalled();
  });

  it("marks non-zero exits as failures and retains the terminal receipt in this turn", async () => {
    const commandResult: ActionResult = {
      success: true,
      text: "Exit code: 2\nSTDERR: build failed",
      data: {
        actionName: "SHELL",
        command: "bun run build",
        exitCode: 2,
        stderr: "build failed",
      },
    };
    const { action, message, runtime } = fixture({ result: commandResult });
    const result = await runWithTurnRuntimeScope(
      runtime,
      { settings: new Map(), settledActionResults: [] },
      async () => {
        const response = await action.handler(runtime, message, undefined, {
          parameters: { command: "bun run build" },
        });
        return { response, actions: getScopedTurnActionResults(runtime) };
      },
    );

    expect(result.response).toMatchObject({
      success: false,
      error: "SHELL_COMMAND_FAILED",
      text: expect.stringContaining("exited with status 2"),
    });
    expect(result.actions).toContainEqual(result.response);
  });
});

describe("official Eliza SHELL action integration", () => {
  it("executes through Doolittle's SDK-compatible terminal route", async () => {
    const terminal = {
      run: async (command: string, timeoutMs?: number) => ({
        id: "sdk-shell-run",
        command,
        backend: "local",
        cwd: "/workspace",
        timeoutMs,
        timedOut: false,
        durationMs: 4,
        exitCode: 0,
        stdout: "/workspace\n",
        stderr: "",
        startedAt: "2026-07-30T00:00:00.000Z",
        completedAt: "2026-07-30T00:00:00.004Z",
      }),
    };
    const context = {
      runtime: {
        getService: (name: string) =>
          name === DOOLITTLE_SHELL_SERVICE ? { run: terminal.run } : null,
      },
      services: {
        logger: { captureError: () => "" },
        terminal,
      },
    } as unknown as AppContext;
    const server = await serveFetchTest(async (request) => {
      return (
        (await handleOperationsRoutes(
          context,
          request,
          new URL(request.url),
        )) ?? new Response("Not found", { status: 404 })
      );
    });
    const previousPort = process.env.ELIZA_PORT;
    process.env.ELIZA_PORT = String(server.port);

    try {
      const result = await terminalAction.handler(
        {} as never,
        {
          id: "message-1",
          roomId: "room-1",
          content: { text: "Run pwd" },
        } as never,
        undefined,
        { parameters: { command: "pwd" } },
      );

      expect(result).toMatchObject({
        success: true,
        verifiedUserFacing: true,
        userFacingText: "/workspace",
        data: {
          actionName: "SHELL",
          command: "pwd",
          exitCode: 0,
          stdout: "/workspace\n",
          stderr: "",
        },
      });
    } finally {
      server.stop(true);
      if (previousPort === undefined) {
        delete process.env.ELIZA_PORT;
      } else {
        process.env.ELIZA_PORT = previousPort;
      }
    }
  });
});
