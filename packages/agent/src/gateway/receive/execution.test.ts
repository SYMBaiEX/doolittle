import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleConversationRoutes } from "@/server/routes/conversation";
import { RunControllerService } from "@/services/run-controller-service";
import type {
  GatewayInboxRecord,
  GatewayOutboxRecord,
} from "../read/history-view";
import { executeGatewayReceiveTurn } from "./execution";
import type { GatewayReceiveDependencies } from "./types";

describe("executeGatewayReceiveTurn", () => {
  it("streams progress through the extracted queue and preserves the tracked session id", async () => {
    const queueProgressFlush = vi.fn(async () => undefined);
    const deps = {
      context: {
        config: { workspaceDir: "/workspace/active" } as never,
        runtime: {} as never,
        services: { runController: new RunControllerService() } as never,
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        messageId: "message-1",
        text: "hello",
        attachments: [
          {
            id: "attachment-1",
            url: "https://example.test/photo.png",
            contentType: "image",
            mimeType: "image/png",
          },
        ],
      } as never,
      session: {
        sessionKey: "session-1",
        activeAgentSessionId: "run-1",
        platform: "api",
        threadId: "thread-1",
      } as never,
      adapter: undefined,
      recordInbox: vi.fn(
        () => ({ recordId: "inbox-1" }) as unknown as GatewayInboxRecord,
      ),
      recordOutbox: vi.fn(
        () => ({ recordId: "outbox-1" }) as unknown as GatewayOutboxRecord,
      ),
      pushTrace: vi.fn(() => undefined),
      observeAdapter: vi.fn(async () => undefined),
      editDelivery: vi.fn(async () => ({ id: "delivery-1" }) as never),
      snapshotState: vi.fn(async () => undefined),
      createProgressiveQueue: () => ({
        queueProgressFlush,
        getProgressiveDelivery: () =>
          ({
            id: "progressive-1",
            target: {
              platform: "api",
              channelId: "room-1",
              userId: "user-1",
              mode: "origin",
            },
            text: "partial",
            createdAt: "2026-04-01T00:00:00.000Z",
          }) as never,
        getProgressiveFailure: () => undefined,
      }),
      executeTurn: vi.fn(async (_input, _context, hooks) => {
        await hooks.onProgress?.({
          delta: "Hello",
          response: "Hello world",
          phase: "model",
        });
        await hooks.onRunEvent?.({
          run: { progressMode: "verbose" },
        } as never);
        return { response: "final response", sessionId: "run-1" };
      }),
    } satisfies GatewayReceiveDependencies & {
      session: {
        sessionKey: string;
        activeAgentSessionId?: string;
        platform: string;
        threadId?: string;
      };
      createProgressiveQueue: () => {
        queueProgressFlush: typeof queueProgressFlush;
        getProgressiveDelivery: () => { id: string } | undefined;
      };
      executeTurn: typeof import("@/runtime/turn-stream").executeAgentTurnWithProgress;
    };

    const result = await executeGatewayReceiveTurn(deps);

    expect(result.response).toBe("final response");
    expect(result.runSessionId).toBe("run-1");
    expect(result.progressiveDelivery).toEqual({ id: "progressive-1" });
    expect(queueProgressFlush).toHaveBeenCalled();
    expect(deps.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            id: "attachment-1",
            url: "https://example.test/photo.png",
          }),
        ],
      }),
      deps.context,
      expect.any(Object),
    );
  });

  it("keeps text-only gateway messages attachment-free", async () => {
    const executeTurn = vi.fn(async () => ({
      response: "done",
      sessionId: "session-1",
    }));
    const deps = {
      context: {
        config: { workspaceDir: "/workspace/active" } as never,
        runtime: {} as never,
        services: { runController: new RunControllerService() } as never,
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      },
      session: { sessionKey: "session-1", platform: "api" },
      adapter: undefined,
      recordInbox: vi.fn(),
      recordOutbox: vi.fn(),
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(),
      editDelivery: vi.fn(),
      snapshotState: vi.fn(),
      createProgressiveQueue: () => ({
        queueProgressFlush: vi.fn(async () => undefined),
        getProgressiveDelivery: () => undefined,
        getProgressiveFailure: () => undefined,
      }),
      executeTurn,
    } as never;

    await executeGatewayReceiveTurn(deps);

    expect(executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ attachments: undefined }),
      expect.anything(),
      expect.any(Object),
    );
  });

  it("leases the active workspace for the turn and releases it after success", async () => {
    const runController = new RunControllerService();
    const registerWorkspaceRun = vi.spyOn(
      runController,
      "registerWorkspaceRun",
    );
    let finishExecution: (() => void) | undefined;
    const executionFinished = new Promise<void>((resolve) => {
      finishExecution = resolve;
    });
    let executionStarted: (() => void) | undefined;
    const executionStartedPromise = new Promise<void>((resolve) => {
      executionStarted = resolve;
    });
    const executeTurn = vi.fn(async () => {
      executionStarted?.();
      await executionFinished;
      return { response: "done", sessionId: "session-1" };
    });
    const deps = {
      context: {
        config: { workspaceDir: "/workspace/active" },
        runtime: {} as never,
        services: { runController },
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        messageId: "message-1",
        text: "hello",
      },
      session: {
        sessionKey: "session-1",
        activeAgentSessionId: "run-1",
        platform: "api",
      },
      adapter: undefined,
      recordInbox: vi.fn(),
      recordOutbox: vi.fn(),
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(),
      editDelivery: vi.fn(),
      snapshotState: vi.fn(),
      createProgressiveQueue: () => ({
        queueProgressFlush: vi.fn(async () => undefined),
        getProgressiveDelivery: () => undefined,
        getProgressiveFailure: () => undefined,
      }),
      executeTurn,
    } as never;

    const result = executeGatewayReceiveTurn(deps);
    await executionStartedPromise;
    expect(runController.workspaceSwitchConflict("/workspace/other")).toEqual(
      expect.objectContaining({ workspaceDir: "/workspace/active" }),
    );
    finishExecution?.();

    await expect(result).resolves.toMatchObject({
      response: "done",
      runSessionId: "run-1",
    });

    expect(registerWorkspaceRun).toHaveBeenCalledWith(
      expect.stringMatching(/^gateway:[a-f0-9]{48}$/u),
      "/workspace/active",
    );
    expect(executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: expect.stringMatching(/^gateway:[a-f0-9]{48}$/u),
      }),
      expect.anything(),
      expect.any(Object),
    );
    expect(
      runController.workspaceSwitchConflict("/workspace/other"),
    ).toBeUndefined();
  });

  it("isolates stable run ids across connector accounts and opaque ids", async () => {
    const runController = new RunControllerService();
    const registerWorkspaceRun = vi.spyOn(
      runController,
      "registerWorkspaceRun",
    );
    const executeTurn = vi.fn(async () => ({
      response: "done",
      sessionId: "session-1",
    }));
    const createDeps = (
      accountId: string,
      channelId = "channel:primary",
      threadId = "thread:primary",
    ) =>
      ({
        context: {
          config: { workspaceDir: "/workspace/active" },
          runtime: {} as never,
          services: { runController },
        },
        message: {
          platform: "slack",
          userId: "user:1",
          roomId: "room/1",
          messageId: "message:1",
          text: "hello",
          channelId,
          threadId,
          metadata: { accountId },
        },
        session: { sessionKey: "session-1", platform: "slack" },
        adapter: undefined,
        recordInbox: vi.fn(),
        recordOutbox: vi.fn(),
        pushTrace: vi.fn(),
        observeAdapter: vi.fn(),
        editDelivery: vi.fn(),
        snapshotState: vi.fn(),
        createProgressiveQueue: () => ({
          queueProgressFlush: vi.fn(async () => undefined),
          getProgressiveDelivery: () => undefined,
          getProgressiveFailure: () => undefined,
        }),
        executeTurn,
      }) as never;

    await executeGatewayReceiveTurn(createDeps("workspace:primary"));
    const firstRunId = registerWorkspaceRun.mock.calls[0]?.[0];
    await executeGatewayReceiveTurn(createDeps("workspace:secondary"));
    const secondRunId = registerWorkspaceRun.mock.calls[1]?.[0];
    await executeGatewayReceiveTurn(
      createDeps("workspace:primary", "channel:secondary"),
    );
    const channelRunId = registerWorkspaceRun.mock.calls[2]?.[0];
    await executeGatewayReceiveTurn(
      createDeps("workspace:primary", "channel:primary", "thread:secondary"),
    );
    const threadRunId = registerWorkspaceRun.mock.calls[3]?.[0];

    expect(firstRunId).toMatch(/^gateway:[a-f0-9]{48}$/u);
    expect(secondRunId).toMatch(/^gateway:[a-f0-9]{48}$/u);
    expect(secondRunId).not.toBe(firstRunId);
    expect(channelRunId).not.toBe(firstRunId);
    expect(threadRunId).not.toBe(firstRunId);
    expect(registerWorkspaceRun).toHaveBeenCalledWith(
      firstRunId,
      "/workspace/active",
    );
    expect(executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ runId: firstRunId }),
      expect.anything(),
      expect.any(Object),
    );
  });

  it("cancels a route-safe gateway run, aborts execution, and releases its workspace", async () => {
    const runController = new RunControllerService();
    let runId = "";
    let executionStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      executionStarted = resolve;
    });
    let lateMutation = false;
    const executeTurn = vi.fn(async (input, _context, hooks) => {
      runId = input.runId ?? "";
      runController.startTurn({
        sessionId: "session-cancel",
        roomId: "room-cancel",
        runId,
        source: "slack",
        message: "cancel this gateway turn",
        runDepth: "standard",
        configuredMaxIterations: 45,
        progressMode: "new",
      });
      executionStarted?.();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          lateMutation = true;
          resolve();
        }, 1_000);
        hooks.abortSignal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
      return { response: "unreachable", sessionId: "session-cancel" };
    });
    const deps = {
      context: {
        config: { workspaceDir: "/workspace/active" },
        runtime: {} as never,
        services: { runController },
      },
      message: {
        platform: "slack",
        userId: "user:1",
        roomId: "room/1",
        messageId: "1712345678.123456",
        text: "cancel this gateway turn",
        metadata: { accountId: "workspace:primary" },
      },
      session: { sessionKey: "session-cancel", platform: "slack" },
      adapter: undefined,
      recordInbox: vi.fn(),
      recordOutbox: vi.fn(),
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(),
      editDelivery: vi.fn(),
      snapshotState: vi.fn(),
      createProgressiveQueue: () => ({
        queueProgressFlush: vi.fn(async () => undefined),
        getProgressiveDelivery: () => undefined,
        getProgressiveFailure: () => undefined,
      }),
      executeTurn,
    } as never;

    const execution = executeGatewayReceiveTurn(deps);
    await started;
    expect(runId).toMatch(/^gateway:[a-f0-9]{48}$/u);
    expect(runId.length).toBeLessThanOrEqual(128);
    expect(runController.workspaceSwitchConflict("/workspace/other")).toEqual(
      expect.objectContaining({ runId }),
    );

    const cancellationUrl = new URL(
      `http://localhost/chat/runs/${runId}/cancel`,
    );
    const cancellation = await handleConversationRoutes(
      { services: { runController } } as unknown as AppContext,
      new Request(cancellationUrl, { method: "POST" }),
      cancellationUrl,
    );

    expect(cancellation?.status).toBe(200);
    await expect(cancellation?.json()).resolves.toMatchObject({
      accepted: true,
      run: { runId, status: "cancelled", terminalReason: "cancelled" },
    });
    await expect(execution).rejects.toMatchObject({ name: "AbortError" });
    expect(lateMutation).toBe(false);
    expect(
      runController.workspaceSwitchConflict("/workspace/other"),
    ).toBeUndefined();
    expect(runController.getByRunId(runId)).toMatchObject({
      status: "cancelled",
      terminalReason: "cancelled",
    });
  });

  it("releases the active workspace when execution fails", async () => {
    const runController = new RunControllerService();
    const registerWorkspaceRun = vi.spyOn(
      runController,
      "registerWorkspaceRun",
    );
    const executeTurn = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    const deps = {
      context: {
        config: { workspaceDir: "/workspace/active" },
        runtime: {} as never,
        services: { runController },
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      },
      session: { sessionKey: "session-1", platform: "api" },
      adapter: undefined,
      recordInbox: vi.fn(),
      recordOutbox: vi.fn(),
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(),
      editDelivery: vi.fn(),
      snapshotState: vi.fn(),
      createProgressiveQueue: () => ({
        queueProgressFlush: vi.fn(async () => undefined),
        getProgressiveDelivery: () => undefined,
        getProgressiveFailure: () => undefined,
      }),
      executeTurn,
    } as never;

    await expect(executeGatewayReceiveTurn(deps)).rejects.toThrow(
      "provider unavailable",
    );

    expect(registerWorkspaceRun).toHaveBeenCalledWith(
      expect.any(String),
      "/workspace/active",
    );
    expect(
      runController.workspaceSwitchConflict("/workspace/other"),
    ).toBeUndefined();
  });

  it("releases the active workspace when the initiating request aborts", async () => {
    const runController = new RunControllerService();
    const registerWorkspaceRun = vi.spyOn(
      runController,
      "registerWorkspaceRun",
    );
    const controller = new AbortController();
    const executeTurn = vi.fn(async (_input, _context, hooks) => {
      await new Promise<void>((_, reject) => {
        hooks.abortSignal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
        controller.abort();
      });
      return { response: "unreachable", sessionId: "session-1" };
    });
    const deps = {
      context: {
        config: { workspaceDir: "/workspace/active" },
        runtime: {} as never,
        services: { runController },
      },
      message: {
        platform: "api",
        userId: "user-1",
        roomId: "room-1",
        text: "hello",
      },
      session: { sessionKey: "session-1", platform: "api" },
      adapter: undefined,
      recordInbox: vi.fn(),
      recordOutbox: vi.fn(),
      pushTrace: vi.fn(),
      observeAdapter: vi.fn(),
      editDelivery: vi.fn(),
      snapshotState: vi.fn(),
      createProgressiveQueue: () => ({
        queueProgressFlush: vi.fn(async () => undefined),
        getProgressiveDelivery: () => undefined,
        getProgressiveFailure: () => undefined,
      }),
      executeTurn,
    } as never;

    await expect(
      executeGatewayReceiveTurn(deps, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(registerWorkspaceRun).toHaveBeenCalledWith(
      expect.any(String),
      "/workspace/active",
    );
    expect(
      runController.workspaceSwitchConflict("/workspace/other"),
    ).toBeUndefined();
  });
});
