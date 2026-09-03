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
  it("preserves an accumulated delta and adds one actionable failure notice", () => {
    let assistant: DisplayMessage = {
      ...pendingAssistant,
      content: "A partial answer streamed before the transport failed.",
    };
    const finishRequest = vi.fn();

    const handled = handleFailedChatTerminalEvent(
      {
        requestId: "request-1",
        event: "response.failed",
        data: { message: "The connection closed unexpectedly." },
      } satisfies ChatEvent,
      "session-1",
      (sessionId, requestId, update) => {
        expect(sessionId).toBe("session-1");
        expect(requestId).toBe("request-1");
        assistant = update(assistant);
      },
      finishRequest,
    );

    expect(handled).toBe(true);
    expect(assistant).toEqual({
      ...pendingAssistant,
      content:
        "A partial answer streamed before the transport failed.\n\nResponse interrupted: The connection closed unexpectedly. Retry to continue.",
      pending: false,
      error: true,
    });
    expect(assistant.content.match(/partial answer/g)).toHaveLength(1);
    expect(finishRequest).toHaveBeenCalledOnce();
    expect(finishRequest).toHaveBeenCalledWith("request-1");
  });

  it("shows a concise actionable failure notice when no response content arrived", () => {
    let updated: DisplayMessage | undefined;
    const finishRequest = vi.fn();

    const handled = handleFailedChatTerminalEvent(
      {
        requestId: "request-1",
        event: "error",
        data: {},
      } satisfies ChatEvent,
      "session-1",
      (_sessionId, _requestId, update) => {
        updated = update({ ...pendingAssistant, content: "" });
      },
      finishRequest,
    );

    expect(handled).toBe(true);
    expect(updated).toEqual({
      ...pendingAssistant,
      content: "Response interrupted. Retry to continue.",
      pending: false,
      error: true,
    });
    expect(finishRequest).toHaveBeenCalledOnce();
  });

  it("does not append the failure notice again for a replayed terminal event", () => {
    const failure =
      "Response interrupted: The turn failed safely. Retry to continue.";
    let updated: DisplayMessage | undefined;

    handleFailedChatTerminalEvent(
      {
        requestId: "request-1",
        event: "response.failed",
        data: { message: "The turn failed safely." },
      } satisfies ChatEvent,
      "session-1",
      (_sessionId, _requestId, update) => {
        updated = update({
          ...pendingAssistant,
          content: `Partial answer\n\n${failure}`,
        });
      },
      vi.fn(),
    );

    expect(updated?.content).toBe(`Partial answer\n\n${failure}`);
  });

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
