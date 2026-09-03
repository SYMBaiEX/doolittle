import { describe, expect, it } from "vitest";
import {
  addUnreadMessageIds,
  appendedMessageIds,
  mergeUnreadMessageIds,
} from "./chat-unread";

describe("chat unread messages", () => {
  it("counts distinct message IDs appended to the transcript tail", () => {
    expect(appendedMessageIds(["user-1"], ["user-1", "assistant-1"])).toEqual([
      "assistant-1",
    ]);
    expect(
      mergeUnreadMessageIds(["assistant-1"], ["assistant-1", "assistant-2"]),
    ).toEqual(["assistant-1", "assistant-2"]);
  });

  it("ignores streamed updates and prepended history", () => {
    expect(
      appendedMessageIds(["user-1", "assistant-1"], ["user-1", "assistant-1"]),
    ).toEqual([]);
    expect(
      appendedMessageIds(
        ["user-1", "assistant-1"],
        ["older-1", "user-1", "assistant-1"],
      ),
    ).toEqual([]);
  });

  it("keeps unread IDs isolated when the viewed session changes", () => {
    const withFirstSession = addUnreadMessageIds({}, "session-1", [
      "message-1",
    ]);
    expect(
      addUnreadMessageIds(withFirstSession, "session-2", ["message-2"]),
    ).toEqual({
      "session-1": ["message-1"],
      "session-2": ["message-2"],
    });
  });
});
