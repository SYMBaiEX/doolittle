import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { handleChatRoute } from "../../packages/agent/src/server/routes/conversation/chat";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service/index";
import type { ChatTurnRequest } from "../../packages/agent/src/types/runtime/index";

const { executeAgentTurnWithProgress } = vi.hoisted(() => ({
  executeAgentTurnWithProgress: vi.fn(),
}));

vi.mock("../../packages/agent/src/runtime/turn-stream", () => ({
  executeAgentTurnWithProgress,
}));

function createContext(): AppContext {
  return {
    config: {
      agentName: "Doolittle Test",
      dataDir: ".",
      workspaceDir: process.cwd(),
    },
    runtime: { agentId: "agent-test" },
    services: {
      inputRequests: { supersedePendingForSession: () => undefined },
      runController: new RunControllerService(),
      sessions: {
        assignSessionProject: () => true,
        countBySessionRole: () => 0,
        getProject: () => undefined,
        projectIdForSession: () => undefined,
        recordRunTerminalBoundary: () => undefined,
      },
    },
  } as unknown as AppContext;
}

function chatRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockFinalizedFailure(detail: string): void {
  executeAgentTurnWithProgress.mockImplementation(
    async (input: ChatTurnRequest, context: AppContext) => {
      const roomId = String(input.roomId);
      context.services.runController.startTurn({
        sessionId: roomId,
        roomId,
        runId: input.runId ?? "run-test",
        source: input.source ?? "api",
        message: input.message,
        runDepth: "standard",
        configuredMaxIterations: 12,
        progressMode: "new",
      });
      context.services.runController.finishTurn(roomId, "error", detail);
      return { response: detail, sessionId: roomId };
    },
  );
}

it("returns the finalized user-facing failure detail for a non-streamed chat run", async () => {
  const detail =
    "The active provider (openai:gpt-5) is rate-limiting this request right now. Wait a moment or switch models.";
  const context = createContext();
  mockFinalizedFailure(detail);

  const response = await handleChatRoute(
    context,
    chatRequest({
      message: "Repair the failing tests.",
      runId: "failed-run",
      roomId: "failed-room",
    }),
  );

  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toEqual({
    error: detail,
    code: "turn_failed",
  });
  expect(
    context.services.runController.getTerminalTaskEvent("failed-run")?.data,
  ).toMatchObject({ message: detail, userFacing: true });
});

it("streams the finalized user-facing failure detail in its terminal event", async () => {
  const detail =
    "The frontend changed, but no browser-analysis attempt followed the latest mutation. Review the current app before claiming completion.";
  const context = createContext();
  mockFinalizedFailure(detail);

  const response = await handleChatRoute(
    context,
    chatRequest({
      message: "Repair the frontend.",
      runId: "streamed-failed-run",
      roomId: "streamed-failed-room",
      stream: true,
    }),
  );

  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).toContain("event: response.failed");
  expect(text).toContain(detail);
  expect(text).toContain('"userFacing":true');
});

it("keeps rejected internal execution diagnostics out of the terminal failure", async () => {
  const context = createContext();
  executeAgentTurnWithProgress.mockRejectedValue(
    new Error("private provider diagnostic"),
  );

  const response = await handleChatRoute(
    context,
    chatRequest({
      message: "Repair the failing tests.",
      runId: "internal-failed-run",
      roomId: "internal-failed-room",
    }),
  );

  expect(response.status).toBe(500);
  await expect(response.json()).resolves.toEqual({
    error: "The response could not be completed. Please try again.",
    code: "turn_failed",
  });
  expect(
    context.services.runController.getTerminalTaskEvent("internal-failed-run")
      ?.data,
  ).toMatchObject({
    message: "The response could not be completed. Please try again.",
  });
  expect(
    JSON.stringify(
      context.services.runController.getTerminalTaskEvent(
        "internal-failed-run",
      ),
    ),
  ).not.toContain("private provider diagnostic");
});
