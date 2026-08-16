import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomHandlerQueue } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleConversationRoutes } from "@/server/routes/conversation";
import { RunControllerService } from "@/services/run-controller-service";

function createContext() {
  const runController = new RunControllerService();
  return {
    config: {
      agentName: "Doolittle Test",
    },
    runtime: {
      roomHandlerQueue: new RoomHandlerQueue(),
    },
    gateway: {
      receive: async () => ({
        ok: true,
        response: "assistant reply",
        traceId: "trace-1",
        deliveryId: "delivery-1",
      }),
    },
    services: {
      runController,
      apiTransport: {
        resolveContinuation: (
          previousResponseId: string | undefined,
          userId: string,
        ) =>
          previousResponseId === "missing"
            ? {
                ok: false as const,
                code: "response_not_found" as const,
                status: 404 as const,
                error: "previous_response_id was not found",
              }
            : {
                ok: true as const,
                roomId: `room:${userId}`,
              },
        list: (limit: number) => [
          {
            id: `resp-list-${limit}`,
            createdAt: 321,
            outputText: "listed reply",
            roomId: "room:list",
          },
        ],
        get: (id: string) =>
          id === "resp-lookup"
            ? {
                id,
                createdAt: 456,
                outputText: "lookup reply",
                roomId: "room:lookup",
              }
            : undefined,
        create: (input: {
          id?: string;
          input: string;
          outputText: string;
          userId: string;
          roomId: string;
          previousResponseId?: string;
          metadata?: Record<string, string>;
        }) => ({
          id: input.id ?? "resp-1",
          createdAt: 123,
          previousResponseId: input.previousResponseId,
          outputText: input.outputText,
          roomId: input.roomId,
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleConversationRoutes", () => {
  it("cancels the registered server turn and exposes its retained receipt", async () => {
    const context = createContext();
    const controller = new AbortController();
    context.services.runController.startTurn({
      sessionId: "desktop:session",
      roomId: "desktop:session",
      runId: "desktop-run-1",
      source: "desktop",
      message: "long running provider work",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "new",
    });
    context.services.runController.registerAbortController(
      "desktop-run-1",
      controller,
    );

    const cancelled = await handleConversationRoutes(
      context,
      new Request("http://localhost/chat/runs/desktop-run-1/cancel", {
        method: "POST",
      }),
      new URL("http://localhost/chat/runs/desktop-run-1/cancel"),
    );

    expect(controller.signal.aborted).toBe(true);
    expect(cancelled?.status).toBe(200);
    await expect(cancelled?.json()).resolves.toMatchObject({
      accepted: true,
      run: { status: "cancelled", terminalReason: "cancelled" },
    });

    const receipt = await handleConversationRoutes(
      context,
      new Request("http://localhost/chat/runs/desktop-run-1"),
      new URL("http://localhost/chat/runs/desktop-run-1"),
    );
    expect(receipt?.status).toBe(200);
    await expect(receipt?.json()).resolves.toMatchObject({
      run: {
        runId: "desktop-run-1",
        status: "cancelled",
        endedAt: expect.any(String),
      },
    });
  });

  it("lists stored responses through the legacy GET alias", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/v1/responses?limit=7"),
      new URL("http://localhost/v1/responses?limit=7"),
    );

    await expect(response?.json()).resolves.toEqual({
      data: [
        {
          id: "resp-list-7",
          object: "response",
          created_at: 321,
          previous_response_id: undefined,
          output_text: "listed reply",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "listed reply" }],
            },
          ],
          room_id: "room:list",
        },
      ],
    });
  });

  it("returns stored response details through the legacy GET alias", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/v1/responses/resp-lookup"),
      new URL("http://localhost/v1/responses/resp-lookup"),
    );

    await expect(response?.json()).resolves.toEqual({
      id: "resp-lookup",
      object: "response",
      created_at: 456,
      previous_response_id: undefined,
      output_text: "lookup reply",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "lookup reply" }],
        },
      ],
      room_id: "room:lookup",
    });
  });

  it("returns 404 when a stored response record does not exist", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/v1/responses/missing"),
      new URL("http://localhost/v1/responses/missing"),
    );

    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toEqual({
      error: "response not found",
    });
  });

  it("rejects non-boolean response streaming before agent execution", async () => {
    const context = createContext();
    let received = false;
    context.gateway.receive = async () => {
      received = true;
      return {
        ok: true,
        response: "should not run",
      };
    };

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({ input: "hello", stream: "false" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "stream must be a boolean",
    });
    expect(received).toBe(false);
  });

  it("rejects non-string response identity and continuation fields", async () => {
    for (const [field, value, error] of [
      ["user", 42, "user must be a string"],
      ["previous_response_id", 42, "previous_response_id must be a string"],
    ] as const) {
      const context = createContext();
      let received = false;
      context.gateway.receive = async () => {
        received = true;
        return { ok: true, response: "should not run" };
      };

      const response = await handleConversationRoutes(
        context,
        new Request("http://localhost/v1/responses", {
          method: "POST",
          body: JSON.stringify({ input: "hello", [field]: value }),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/v1/responses"),
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({ error });
      expect(received).toBe(false);
    }
  });

  it("rejects Responses features that would otherwise be silently dropped", async () => {
    for (const [field, value, error] of [
      [
        "model",
        "gpt-5",
        "model is not supported by this text-only Responses endpoint",
      ],
      [
        "tools",
        [{ type: "function", name: "lookup" }],
        "tools is not supported by this text-only Responses endpoint",
      ],
    ] as const) {
      const context = createContext();
      let received = false;
      context.gateway.receive = async () => {
        received = true;
        return { ok: true, response: "should not run" };
      };

      const response = await handleConversationRoutes(
        context,
        new Request("http://localhost/v1/responses", {
          method: "POST",
          body: JSON.stringify({ input: "hello", [field]: value }),
          headers: { "content-type": "application/json" },
        }),
        new URL("http://localhost/v1/responses"),
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({ error });
      expect(received).toBe(false);
    }
  });

  it("rejects non-text response content before agent execution", async () => {
    const context = createContext();
    let received = false;
    context.gateway.receive = async () => {
      received = true;
      return { ok: true, response: "should not run" };
    };
    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          input: [
            {
              role: "user",
              content: [
                { type: "input_image", image_url: "https://example.com" },
              ],
            },
          ],
        }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error:
        "input content type input_image is not supported by this text-only Responses endpoint",
    });
    expect(received).toBe(false);
  });

  it("rejects chat requests without a message", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/chat", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/chat"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "message is required",
    });
  });

  it("rejects malformed attachment ids before agent execution", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/chat", {
        method: "POST",
        body: JSON.stringify({
          message: "Review this",
          attachmentIds: ["../../private-key"],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/chat"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toMatchObject({
      code: "invalid_request",
    });
  });

  it("rejects attachments on command messages", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-chat-route-"));
    try {
      const attachmentsDir = join(dataDir, "attachments");
      mkdirSync(attachmentsDir);
      const id = randomUUID();
      const contents = Buffer.from("status context");
      writeFileSync(join(attachmentsDir, `${id}.txt`), contents);
      writeFileSync(
        join(attachmentsDir, `${id}.meta.json`),
        JSON.stringify({
          version: 1,
          id,
          name: "status.txt",
          kind: "document",
          mimeType: "text/plain",
          sizeBytes: contents.byteLength,
          sha256: createHash("sha256").update(contents).digest("hex"),
          storedName: `${id}.txt`,
        }),
      );
      const context = createContext();
      context.config.dataDir = dataDir;
      const response = await handleConversationRoutes(
        context,
        new Request("http://localhost/chat", {
          method: "POST",
          body: JSON.stringify({
            message: "/status",
            attachmentIds: [id],
          }),
          headers: {
            "content-type": "application/json",
          },
        }),
        new URL("http://localhost/chat"),
      );

      expect(response?.status).toBe(400);
      await expect(response?.json()).resolves.toEqual({
        error: "Command messages cannot include attachments.",
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("rejects responses requests without input", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({}),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "input is required",
    });
  });

  it("rejects an unknown previous response before agent execution", async () => {
    const context = createContext();
    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          input: "continue",
          previous_response_id: "missing",
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(404);
    await expect(response?.json()).resolves.toEqual({
      error: "previous_response_id was not found",
      code: "response_not_found",
    });
  });

  it("creates non-stream responses payloads through the api transport", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          input: "hello",
          user: "user-1",
          metadata: {
            source: "test",
          },
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/v1/responses"),
    );

    await expect(response?.json()).resolves.toEqual({
      id: "resp-1",
      object: "response",
      created_at: 123,
      previous_response_id: undefined,
      output_text: "assistant reply",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "assistant reply" }],
        },
      ],
      room_id: "room:user-1",
    });
  });

  it("preserves non-stream gateway failures without storing a response", async () => {
    const context = createContext();
    let created = false;
    context.gateway.receive = async () => ({
      ok: false,
      response: "Authorization required. Pairing code: pair-123",
      pairingCode: "pair-123",
      traceId: "trace-rejected",
    });
    context.services.apiTransport.create = (() => {
      created = true;
      throw new Error("failed turns must not be stored");
    }) as typeof context.services.apiTransport.create;

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({ input: "hello", user: "user-1" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      ok: false,
      response: "Authorization required. Pairing code: pair-123",
      pairingCode: "pair-123",
      traceId: "trace-rejected",
    });
    expect(created).toBe(false);
  });

  it("returns 502 for a completed response whose delivery failed", async () => {
    const context = createContext();
    context.gateway.receive = async () => ({
      ok: false,
      response: "computed response",
      agentCompleted: true,
      deliveryStatus: "rejected",
      deliveryFailure: "adapter unavailable",
      outboxRecordId: "outbox-rejected",
    });

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({ input: "hello", user: "user-1" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toMatchObject({
      agentCompleted: true,
      deliveryStatus: "rejected",
      deliveryFailure: "adapter unavailable",
    });
  });

  it("assigns collision-resistant gateway identities to concurrent Responses requests", async () => {
    const context = createContext();
    const messageIds: string[] = [];
    context.gateway.receive = async (message) => {
      messageIds.push(message.messageId ?? "");
      return {
        ok: true,
        response: "assistant reply",
        traceId: `trace-${messageIds.length}`,
        deliveryId: `delivery-${messageIds.length}`,
      };
    };
    const now = vi.spyOn(Date, "now").mockReturnValue(1_234_567_890);

    try {
      const send = () =>
        handleConversationRoutes(
          context,
          new Request("http://localhost/v1/responses", {
            method: "POST",
            body: JSON.stringify({ input: "hello", user: "same-user" }),
            headers: { "content-type": "application/json" },
          }),
          new URL("http://localhost/v1/responses"),
        );

      const responses = await Promise.all([send(), send()]);

      expect(responses.map((response) => response?.status)).toEqual([200, 200]);
      expect(messageIds).toHaveLength(2);
      expect(new Set(messageIds)).toHaveLength(2);
      expect(messageIds).toEqual([
        expect.stringMatching(/^api-msg-[0-9a-f-]{36}$/u),
        expect.stringMatching(/^api-msg-[0-9a-f-]{36}$/u),
      ]);
    } finally {
      now.mockRestore();
    }
  });

  it("aborts streamed Responses work when the SSE consumer cancels", async () => {
    const context = createContext();
    let gatewaySignal: AbortSignal | undefined;
    let markStarted: (() => void) | undefined;
    let markExited: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const exited = new Promise<void>((resolve) => {
      markExited = resolve;
    });
    context.gateway.receive = async (_message, hooks) => {
      gatewaySignal = hooks?.abortSignal;
      markStarted?.();
      return await new Promise((_, reject) => {
        const abort = () => {
          markExited?.();
          reject(
            gatewaySignal?.reason ??
              new DOMException("Responses request aborted", "AbortError"),
          );
        };
        if (gatewaySignal?.aborted) {
          abort();
          return;
        }
        gatewaySignal?.addEventListener("abort", abort, { once: true });
      });
    };

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({ input: "keep working", stream: true }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/v1/responses"),
    );
    const reader = response?.body?.getReader();

    await reader?.read();
    await started;
    await reader?.cancel();
    await exited;

    expect(gatewaySignal?.aborted).toBe(true);
    expect(gatewaySignal?.reason).toMatchObject({ name: "AbortError" });
  });

  it("streams delivery_failed after a completed response cannot be delivered", async () => {
    const context = createContext();
    context.gateway.receive = async (_payload, hooks) => {
      await hooks?.onResponseProgress?.({
        chunk: "computed response",
        response: "computed response",
        phase: "model",
      });
      return {
        ok: false,
        response: "computed response",
        agentCompleted: true,
        deliveryStatus: "rejected",
        deliveryFailure: "adapter unavailable",
        outboxRecordId: "outbox-rejected",
      };
    };

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({ input: "hello", stream: true }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/v1/responses"),
    );
    const body = await response?.text();

    expect(response?.status).toBe(200);
    expect(body).toContain("event: response.failed");
    expect(body).toContain('"code":"delivery_failed"');
    expect(body).toContain('"message":"adapter unavailable"');
    expect(body).not.toContain("event: response.completed");
  });

  it("streams response events through the legacy responses route", async () => {
    const context = createContext();
    context.gateway = {
      receive: async (
        _payload: unknown,
        hooks?: {
          onResponseProgress?: (update: { response: string }) => Promise<void>;
        },
      ) => {
        await hooks?.onResponseProgress?.({ response: "assistant " });
        await hooks?.onResponseProgress?.({ response: "assistant reply" });
        return {
          ok: true,
          response: "assistant reply",
          traceId: "trace-1",
          deliveryId: "delivery-1",
        };
      },
    } as unknown as typeof context.gateway;

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          input: "hello",
          user: "user-1",
          stream: true,
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.headers.get("content-type")).toContain(
      "text/event-stream",
    );
    const body = await response?.text();
    const events = (body ?? "")
      .trim()
      .split("\n\n")
      .map((frame) => {
        const [eventLine, dataLine] = frame.split("\n");
        return {
          event: eventLine?.replace("event: ", ""),
          data: JSON.parse(dataLine?.replace("data: ", "") ?? "{}") as {
            sequence_number?: number;
            response?: { id?: string; output_text?: string };
          },
        };
      });
    expect(events.map((entry) => entry.event)).toEqual([
      "response.created",
      "response.in_progress",
      "response.output_item.added",
      "response.content_part.added",
      "response.output_text.delta",
      "response.output_text.delta",
      "response.output_text.done",
      "response.content_part.done",
      "response.output_item.done",
      "response.completed",
    ]);
    expect(events.map((entry) => entry.data.sequence_number)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(events[0]?.data.response?.id).toMatch(/^resp_/u);
    expect(events.at(-1)?.data.response?.id).toBe(events[0]?.data.response?.id);
    expect(events.at(-1)?.data.response?.output_text).toBe("assistant reply");
  });

  it("accepts Responses input text content blocks", async () => {
    const context = createContext();
    let receivedText = "";
    context.gateway = {
      receive: async (payload: { text: string }) => {
        receivedText = payload.text;
        return {
          ok: true,
          response: "assistant reply",
          traceId: "trace-1",
          deliveryId: "delivery-1",
        };
      },
    } as unknown as typeof context.gateway;

    const response = await handleConversationRoutes(
      context,
      new Request("http://localhost/v1/responses", {
        method: "POST",
        body: JSON.stringify({
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: "First line" },
                { type: "input_text", text: "Second line" },
              ],
            },
          ],
        }),
        headers: {
          "content-type": "application/json",
        },
      }),
      new URL("http://localhost/v1/responses"),
    );

    expect(response?.status).toBe(200);
    expect(receivedText).toBe("First line\nSecond line");
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/not-conversation"),
      new URL("http://localhost/not-conversation"),
    );

    expect(response).toBeNull();
  });
});
