import { describe, expect, it } from "bun:test";

import {
  agentEventLabel,
  eventActionLabel,
  eventActionResult,
  eventRoomId,
} from "./run-progress";

describe("run progress helpers", () => {
  it("extracts room ids from payload root or message envelope", () => {
    expect(eventRoomId({ roomId: "root-room" })).toBe("root-room");
    expect(eventRoomId({ message: { roomId: "message-room" } })).toBe(
      "message-room",
    );
    expect(eventRoomId({})).toBeUndefined();
  });

  it("extracts event action label from content fields", () => {
    expect(
      eventActionLabel({
        content: { actions: ["first-action", "other-action"] },
      }),
    ).toBe("first-action");
    expect(
      eventActionLabel({
        content: { text: "text-label" },
      }),
    ).toBe("text-label");
    expect(
      eventActionLabel({
        content: { actionStatus: "status-label" },
      }),
    ).toBe("status-label");
    expect(eventActionLabel({})).toBeUndefined();
  });

  it("extracts agent event label using prioritized fields", () => {
    expect(
      agentEventLabel({
        label: "label",
        preview: "preview",
        text: "text",
        content: { actions: ["action"] },
      }),
    ).toBe("label");
    expect(agentEventLabel({ preview: "preview", text: "text" })).toBe(
      "preview",
    );
    expect(
      agentEventLabel({ text: "text", content: { actions: ["action"] } }),
    ).toBe("text");
    expect(agentEventLabel({ content: { actions: ["action"] } })).toBe(
      "action",
    );
    expect(agentEventLabel({})).toBeUndefined();
  });

  it("extracts SDK action results and action names from runtime event content", () => {
    const actionResult = {
      success: true,
      data: {
        actionName: "SHELL_COMMAND",
        command: "bun test",
        exitCode: 0,
      },
    };

    expect(eventActionResult({ content: { actionResult } })).toBe(actionResult);
    expect(eventActionResult({ content: { result: actionResult } })).toBe(
      actionResult,
    );
    expect(eventActionLabel({ content: { actionResult } })).toBe(
      "SHELL_COMMAND",
    );
  });
});
