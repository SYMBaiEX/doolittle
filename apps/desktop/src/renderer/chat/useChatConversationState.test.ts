import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../shared/contracts";
import type { StorageLike } from "../conversation-persistence";
import {
  loadStoredChatMessages,
  projectChatSessions,
} from "./useChatConversationState";

function memoryStorage(value: string | null): StorageLike {
  return {
    getItem: () => value,
    setItem: () => undefined,
  };
}

const remoteSession: SessionSummary = {
  endedAt: "2026-08-12T10:00:00.000Z",
  messageCount: 4,
  participants: ["user", "assistant"],
  preview: ["Remote preview"],
  sessionId: "remote",
  title: "Remote session",
};

describe("chat conversation state", () => {
  it("restores only object entries that contain message arrays", () => {
    expect(
      loadStoredChatMessages(
        memoryStorage(
          JSON.stringify({
            valid: [{ id: "message-1" }],
            invalid: { id: "message-2" },
          }),
        ),
      ),
    ).toEqual({ valid: [{ id: "message-1" }] });
    expect(loadStoredChatMessages(memoryStorage("[]"))).toEqual({});
    expect(loadStoredChatMessages(memoryStorage("not json"))).toEqual({});
  });

  it("merges local drafts with remote sessions and keeps pins first", () => {
    const sessions = projectChatSessions({
      messages: {
        local: [
          {
            content: "Inspect the workspace architecture",
            createdAt: "2026-08-12T09:00:00.000Z",
            id: "message-1",
            role: "user",
          },
        ],
      },
      pinnedSessions: { local: true },
      query: "",
      remoteSessions: [remoteSession],
    });

    expect(sessions.map((session) => session.sessionId)).toEqual([
      "local",
      "remote",
    ]);
    expect(sessions[0]).toMatchObject({
      messageCount: 1,
      pinned: true,
      preview: ["Inspect the workspace architecture"],
      title: "Inspect the workspace architecture",
    });
    expect(sessions[1]).toMatchObject({
      pinned: false,
      title: "Remote session",
    });
  });

  it("searches titles, identifiers, and first-message previews", () => {
    expect(
      projectChatSessions({
        messages: {},
        pinnedSessions: {},
        query: "remote preview",
        remoteSessions: [remoteSession],
      }).map((session) => session.sessionId),
    ).toEqual(["remote"]);
    expect(
      projectChatSessions({
        messages: {},
        pinnedSessions: {},
        query: "missing",
        remoteSessions: [remoteSession],
      }),
    ).toEqual([]);
  });
});
