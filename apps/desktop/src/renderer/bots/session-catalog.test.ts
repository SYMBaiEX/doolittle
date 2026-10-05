import type { BotCatalogResponse, BotSummary } from "@doolittle/contracts/bots";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib", () => ({ desktopRequest: mocks.request }));

import { loadBotSessionCatalog } from "./session-catalog";

const bot = (id: string, state: BotSummary["state"], isDefault = false) =>
  ({ id, name: id, isDefault, state }) as BotSummary;
const catalog: BotCatalogResponse = {
  version: 1,
  defaultBotId: "lead",
  bots: [
    bot("lead", "ready", true),
    bot("specialist", "ready"),
    bot("resting", "stopped"),
  ],
};
const session = {
  sessionId: "lead-chat",
  botId: "lead",
  messageCount: 1,
  participants: [] as [],
  preview: [],
};
beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async (path: string, _method, _body, _signal, _timeout, owner) => {
      if (path === "/bots") return catalog;
      if (path === "/bots/lead/conversations")
        return { conversations: [{ sessionId: "lead-chat", botId: "lead" }] };
      if (path === "/bots/specialist/conversations")
        return {
          conversations: [
            { sessionId: "specialist-chat", botId: "specialist" },
          ],
        };
      if (path === "/bots/resting/conversations")
        return {
          conversations: [{ sessionId: "resting-chat", botId: "resting" }],
        };
      if (path === "/sessions?limit=200" && owner === "specialist")
        return {
          sessions: [
            {
              ...session,
              sessionId: "specialist-chat",
              botId: "specialist",
              title: "Actual title",
            },
          ],
        };
      throw new Error("Unexpected request");
    },
  );
});
describe("owned bot conversation discovery", () => {
  it("hydrates actual named history and lists stopped conversations without starting workers", async () => {
    const result = await loadBotSessionCatalog({ sessions: [session] }, []);
    expect(result.sessions.map((item) => item.botId).sort()).toEqual([
      "lead",
      "resting",
      "specialist",
    ]);
    expect(
      result.sessions.find((item) => item.botId === "specialist")?.title,
    ).toBe("Actual title");
    expect(
      mocks.request.mock.calls
        .filter(([path]) => path === "/sessions?limit=200")
        .map((args) => args[5]),
    ).toEqual(["specialist"]);
    expect(
      mocks.request.mock.calls.some(([path]) => path.includes("activate")),
    ).toBe(false);
  });
  it("retains stopped history metadata and reports a live worker read failure", async () => {
    const original = mocks.request.getMockImplementation();
    mocks.request.mockImplementation((...args) =>
      args[0] === "/sessions?limit=200"
        ? Promise.reject(new Error("Worker unavailable"))
        : original?.(...args),
    );
    const result = await loadBotSessionCatalog({ sessions: [session] }, [
      {
        ...session,
        sessionId: "resting-chat",
        botId: "resting",
        title: "Retained",
      },
    ]);
    expect(
      result.sessions.find((item) => item.botId === "resting")?.title,
    ).toBe("Retained");
    expect(result.warnings).toEqual([
      expect.stringContaining("history is unavailable"),
    ]);
  });
  it("rejects conflicting saved owners", async () => {
    const original = mocks.request.getMockImplementation();
    mocks.request.mockImplementation((...args) =>
      args[0] === "/bots/resting/conversations"
        ? Promise.resolve({
            conversations: [{ botId: "resting", sessionId: "lead-chat" }],
          })
        : original?.(...args),
    );
    await expect(
      loadBotSessionCatalog({ sessions: [session] }, []),
    ).rejects.toThrow(/conflicting/u);
  });
});
