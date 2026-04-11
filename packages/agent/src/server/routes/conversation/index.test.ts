import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleConversationRoutes } from "@/server/routes/conversation";

function createContext() {
  return {
    config: {
      agentName: "Doolittle Test",
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
      apiTransport: {
        resolveRoomId: (
          _previousResponseId: string | undefined,
          userId: string,
        ) => `room:${userId}`,
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
          input: string;
          outputText: string;
          userId: string;
          roomId: string;
          previousResponseId?: string;
          metadata?: Record<string, string>;
        }) => ({
          id: "resp-1",
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

  it("returns null for unrelated routes", async () => {
    const response = await handleConversationRoutes(
      createContext(),
      new Request("http://localhost/not-conversation"),
      new URL("http://localhost/not-conversation"),
    );

    expect(response).toBeNull();
  });
});
