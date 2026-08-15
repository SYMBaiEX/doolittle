import { describe, expect, it, vi } from "vitest";
import type { ChatEvent } from "../../shared/contracts";
import { handleFailedChatTerminalEvent } from "./chat-terminal-events";
import type { DisplayMessage } from "./models";

const pendingAssistant: DisplayMessage = {
  id: "assistant:request-1",
  role: "assistant",
  content: "partial output",
  createdAt: "2026-08-15T00:00:00.000Z",
  pending: true,
};

describe("failed chat terminal events", () => {
  it.each(["response.failed", "error"] as const)(
    "marks %s as terminal and retryable",
    (eventName) => {
      let updated: DisplayMessage | undefined;
      const finishRequest = vi.fn();
      const handled = handleFailedChatTerminalEvent(
        {
          requestId: "request-1",
          event: eventName,
          data: { message: "The turn failed safely." },
        } satisfies ChatEvent,
        "session-1",
        (sessionId, requestId, update) => {
          expect(sessionId).toBe("session-1");
          expect(requestId).toBe("request-1");
          updated = update(pendingAssistant);
        },
        finishRequest,
      );

      expect(handled).toBe(true);
      expect(updated).toEqual({
        ...pendingAssistant,
        content: "The turn failed safely.",
        pending: false,
        error: true,
      });
      expect(finishRequest).toHaveBeenCalledOnce();
      expect(finishRequest).toHaveBeenCalledWith("request-1");
    },
  );

  it("ignores non-failure terminal events", () => {
    const updateAssistant = vi.fn();
    const finishRequest = vi.fn();
    expect(
      handleFailedChatTerminalEvent(
        {
          requestId: "request-1",
          event: "response.completed",
          data: { response: "done" },
        },
        "session-1",
        updateAssistant,
        finishRequest,
      ),
    ).toBe(false);
    expect(updateAssistant).not.toHaveBeenCalled();
    expect(finishRequest).not.toHaveBeenCalled();
  });
});
