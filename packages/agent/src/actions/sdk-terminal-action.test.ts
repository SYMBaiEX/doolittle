import { terminalAction } from "@elizaos/agent/actions/terminal";
import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleOperationsRoutes } from "@/server/routes/operations";
import { serveFetchTest } from "@/testing/fetch-server";

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
          name === "shell"
            ? {
                run: terminal.run,
              }
            : null,
      },
      services: {
        logger: {
          captureError: () => "",
        },
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
