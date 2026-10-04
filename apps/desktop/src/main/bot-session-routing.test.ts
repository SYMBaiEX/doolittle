import { describe, expect, it, vi } from "vitest";
import type { AgentTransportRequest } from "../shared/contracts";
import { handleBotApiRequest } from "./bot-api";
import type { BotProcessRegistry } from "./bot-process-registry";
import {
  assertBotSessionRequest,
  attributeBotSessionResponse,
} from "./bot-session-routing";

function request(
  path: string,
  method: AgentTransportRequest["method"] = "GET",
  body?: unknown,
): AgentTransportRequest {
  return {
    requestId: "request-1",
    path,
    method,
    headers: {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

function registry() {
  const owners = new Map<
    string,
    { sessionId: string; botId: string; projectId?: string }
  >();
  const value = {
    get: (id: string) => ({ id, isDefault: id === "default" }),
    bindConversation: vi.fn(
      (botId: string, sessionId: string, projectId?: string) => {
        const existing = owners.get(sessionId);
        if (
          existing &&
          (existing.botId !== botId || existing.projectId !== projectId)
        )
          throw new Error(
            "Conversation belongs to a different bot or project.",
          );
        const owner = existing ?? {
          sessionId,
          botId,
          ...(projectId ? { projectId } : {}),
        };
        owners.set(sessionId, owner);
        return owner;
      },
    ),
    resolveSavedConversationOwner: (id: string) => owners.get(id) ?? null,
    listConversations: (id: string) =>
      [...owners.values()].filter((owner) => owner.botId === id),
    assertConversationOwner: vi.fn((botId: string, sessionId: string) => {
      const owner = owners.get(sessionId);
      if (!owner || owner.botId !== botId)
        throw new Error("Conversation belongs to a different bot.");
      return owner;
    }),
    ensureConversationOwner: vi.fn(async (botId: string, sessionId: string) => {
      const owner = owners.get(sessionId);
      if (!owner || owner.botId !== botId)
        throw new Error("Conversation belongs to a different bot.");
      return owner;
    }),
    assertRunOwner: vi.fn(),
    ensureProjectOwner: vi.fn(async (botId: string, projectId: string) => {
      if (botId !== "bot-one" || projectId !== "project-1")
        throw new Error("Project belongs to a different bot.");
    }),
    ensureResourceOwner: vi.fn(
      async (botId: string, projectId: string, resourceId: string) => {
        if (
          botId !== "bot-one" ||
          projectId !== "project-1" ||
          resourceId !== "resource-1"
        )
          throw new Error("Resource belongs to a different bot.");
      },
    ),
    bindProject: vi.fn(),
    bindResource: vi.fn(),
  } as unknown as BotProcessRegistry;
  return value;
}

describe("bot-bound conversation transport", () => {
  it("requires the saved bot owner for ACP computer calls", async () => {
    const bots = registry();
    bots.bindConversation("bot-one", "session-1");
    await expect(
      assertBotSessionRequest(
        bots,
        request("/acp/terminal/create", "POST", {
          sessionId: "session-1",
          command: "pwd",
        }),
        "bot-two",
      ),
    ).rejects.toThrow(/different bot/i);
    await assertBotSessionRequest(
      bots,
      request("/acp/terminal/create", "POST", {
        sessionId: "session-1",
        command: "pwd",
      }),
      "bot-one",
    );
  });

  it("binds and lists a stopped bot conversation without starting a backend", async () => {
    const bots = registry();
    const created = await handleBotApiRequest(bots, {
      ...request("/bots/bot-one/conversations", "POST", {
        sessionId: "session-1",
        projectId: "project-1",
      }),
      botId: "bot-one",
    });
    expect(created?.status).toBe(201);
    expect(JSON.parse(created?.body ?? "null").conversation).toMatchObject({
      botId: "bot-one",
      sessionId: "session-1",
    });
    const listed = await handleBotApiRequest(
      bots,
      request("/bots/bot-one/conversations"),
    );
    expect(JSON.parse(listed?.body ?? "null").conversations).toHaveLength(1);
    const owner = await handleBotApiRequest(
      bots,
      request("/bots/conversations/owner?sessionId=session-1"),
    );
    expect(JSON.parse(owner?.body ?? "null").conversation.botId).toBe(
      "bot-one",
    );
    const conflict = await handleBotApiRequest(
      bots,
      request("/bots/bot-two/conversations", "POST", {
        sessionId: "session-1",
        projectId: "project-1",
      }),
    );
    expect(conflict?.status).toBe(409);
  });

  it("rejects wrong-bot saved reads and attributes only authorized rows", async () => {
    const bots = registry();
    bots.bindConversation("bot-one", "session-1");
    await expect(
      assertBotSessionRequest(
        bots,
        request("/sessions/messages?sessionId=session-1"),
        "bot-two",
      ),
    ).rejects.toThrow(/different bot/i);
    await assertBotSessionRequest(
      bots,
      request("/sessions/messages?sessionId=session-1"),
      "bot-one",
    );
    const response = attributeBotSessionResponse(
      bots,
      request("/sessions"),
      "bot-one",
      {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({ sessions: [{ sessionId: "session-1" }] }),
      },
    );
    expect(JSON.parse(response.body).sessions).toEqual([
      { sessionId: "session-1", botId: "bot-one" },
    ]);
    expect(() =>
      attributeBotSessionResponse(bots, request("/sessions"), "bot-two", {
        status: 200,
        statusText: "OK",
        headers: {},
        body: JSON.stringify({ sessions: [{ sessionId: "session-1" }] }),
      }),
    ).toThrow(/different bot/i);
  });

  it("checks saved Computer resource owner before deletion", async () => {
    const bots = registry();
    await assertBotSessionRequest(
      bots,
      request("/projects/project-1/resources/resource-1", "DELETE"),
      "bot-one",
    );
    await expect(
      assertBotSessionRequest(
        bots,
        request("/projects/project-1/resources/resource-1", "DELETE"),
        "bot-two",
      ),
    ).rejects.toThrow(/different bot/i);
    expect(bots.ensureResourceOwner).toHaveBeenCalledWith(
      "bot-one",
      "project-1",
      "resource-1",
    );
  });
});
