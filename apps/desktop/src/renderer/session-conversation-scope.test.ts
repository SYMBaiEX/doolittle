import { describe, expect, it } from "vitest";
import type { BotConversationScope, SessionSummary } from "../shared/contracts";
import {
  queuedMessageMatchesConfirmedScope,
  resolveSessionConversationScope,
} from "./session-conversation-scope";

const bound = (
  sessionId: string,
  botId: string,
  projectId: string,
  workspacePath: string,
): BotConversationScope => ({
  sessionId,
  botId,
  projectId,
  workspacePath,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

describe("per-session conversation scope", () => {
  it("keeps two chats owned by one bot in distinct immutable roots", () => {
    const scopes = {
      first: bound("first", "bot", "alpha", "/repo/alpha"),
      second: bound("second", "bot", "beta", "/repo/beta"),
    };
    expect(resolveSessionConversationScope("first", [], scopes, {}).kind).toBe(
      "confirmed",
    );
    expect(
      resolveSessionConversationScope("second", [], scopes, {}),
    ).toMatchObject({
      conversation: { workspacePath: "/repo/beta", projectId: "beta" },
    });
  });

  it("saved host scope wins over stale local presentation bindings", () => {
    const saved: SessionSummary[] = [
      {
        sessionId: "first",
        botId: "bot",
        projectId: "alpha",
        workspacePath: "/repo/alpha",
        messageCount: 1,
        participants: [],
        preview: [],
      },
    ];
    expect(
      resolveSessionConversationScope(
        "first",
        saved,
        { first: bound("first", "bot", "beta", "/repo/beta") },
        { first: "beta" },
      ),
    ).toMatchObject({
      conversation: { workspacePath: "/repo/alpha", projectId: "alpha" },
    });
  });

  it("never rebinds rootless saved history to the focused project", () => {
    const saved: SessionSummary[] = [
      {
        sessionId: "legacy",
        projectId: "alpha",
        messageCount: 1,
        participants: [],
        preview: [],
      },
    ];
    expect(
      resolveSessionConversationScope("legacy", saved, {}, { legacy: "alpha" }),
    ).toEqual({ kind: "unknown" });
  });

  it("pauses stale, mismatched, and ownerless queue entries while retaining their data", () => {
    const scope = {
      kind: "confirmed" as const,
      conversation: bound("first", "bot", "alpha", "/repo/alpha"),
    };
    const message = {
      id: "queue",
      sessionId: "first",
      botId: "bot",
      projectId: "alpha",
      workspacePath: "/repo/alpha",
      content: "Keep this draft",
      attachments: [],
    };
    expect(queuedMessageMatchesConfirmedScope(message, scope, "darwin")).toBe(
      true,
    );
    expect(
      queuedMessageMatchesConfirmedScope(
        { ...message, workspacePath: "/repo/beta" },
        scope,
        "darwin",
      ),
    ).toBe(false);
    expect(
      queuedMessageMatchesConfirmedScope(
        { ...message, projectId: "beta" },
        scope,
        "darwin",
      ),
    ).toBe(false);
    expect(
      queuedMessageMatchesConfirmedScope(
        { ...message, botId: undefined },
        scope,
        "darwin",
      ),
    ).toBe(false);
    expect(
      queuedMessageMatchesConfirmedScope(
        message,
        { kind: "unknown" },
        "darwin",
      ),
    ).toBe(false);
    expect(message.content).toBe("Keep this draft");
  });
});
