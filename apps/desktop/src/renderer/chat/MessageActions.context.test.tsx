import { describe, expect, it, vi } from "vitest";
import {
  type MessageActionsProps,
  messageContextActions,
} from "./MessageActions";

function props(
  overrides: Partial<MessageActionsProps> = {},
): MessageActionsProps {
  return {
    message: {
      id: "target-2",
      runId: "run-2",
      role: "assistant",
      content: "Exact target",
      createdAt: "2026-10-05T00:00:00Z",
    },
    backendReady: true,
    activeRequest: null,
    forkingMessageId: "",
    speechSupported: true,
    speakingMessageId: "",
    onBranch: vi.fn(),
    onCopy: vi.fn(),
    onRead: vi.fn(),
    onStopReading: vi.fn(),
    onPromote: vi.fn(),
    ...overrides,
  };
}

describe("Message context actions", () => {
  it("copies, forks, retries, reads and promotes the exact supplied assistant message", () => {
    const value = props();
    const actions = messageContextActions(value);
    for (const id of ["copy", "fork", "retry", "read", "promote"])
      actions.find((item) => item.id === id)?.onSelect();
    expect(value.onCopy).toHaveBeenCalledExactlyOnceWith(value.message);
    expect(value.onBranch).toHaveBeenNthCalledWith(1, value.message, "fork");
    expect(value.onBranch).toHaveBeenNthCalledWith(2, value.message, "retry");
    expect(value.onRead).toHaveBeenCalledExactlyOnceWith(value.message);
    expect(value.onPromote).toHaveBeenCalledExactlyOnceWith(value.message);
    expect(actions.some((item) => item.id === "edit")).toBe(false);
  });
  it("offers edit rather than retry or speech for user messages", () => {
    const value = props();
    value.message = { ...value.message, role: "user" };
    const actions = messageContextActions(value);
    actions.find((item) => item.id === "edit")?.onSelect();
    expect(value.onBranch).toHaveBeenCalledExactlyOnceWith(
      value.message,
      "edit",
    );
    expect(actions.some((item) => ["retry", "read"].includes(item.id))).toBe(
      false,
    );
  });
  it.each([
    "offline",
    "active request",
    "pending message",
    "fork in progress",
    "failed user message",
  ])("blocks branches for %s even if invoked directly", (reason) => {
    const value = props();
    if (reason === "offline") value.backendReady = false;
    if (reason === "active request") value.activeRequest = "request-1";
    if (reason === "pending message")
      value.message = { ...value.message, pending: true };
    if (reason === "fork in progress") value.forkingMessageId = "other-message";
    if (reason === "failed user message")
      value.message = { ...value.message, role: "user", error: true };
    const actions = messageContextActions(value);
    for (const item of actions.filter((item) =>
      ["fork", "retry", "edit"].includes(item.id),
    )) {
      expect(item.disabled).toBe(true);
      item.onSelect();
    }
    expect(value.onBranch).not.toHaveBeenCalled();
  });
  it("stops only the response already being read and guards unavailable speech", () => {
    const value = props({ speakingMessageId: "target-2" });
    const item = messageContextActions(value).find(
      (item) => item.id === "read",
    );
    expect(item?.label).toBe("Stop reading response");
    item?.onSelect();
    expect(value.onStopReading).toHaveBeenCalledOnce();
    expect(value.onRead).not.toHaveBeenCalled();
    const unavailable = props({ speechSupported: false });
    const disabled = messageContextActions(unavailable).find(
      (item) => item.id === "read",
    );
    expect(disabled?.disabled).toBe(true);
    disabled?.onSelect();
    expect(unavailable.onRead).not.toHaveBeenCalled();
  });
  it("does not promote pending/error/unowned messages or invoke promotion offline", () => {
    for (const message of [
      { pending: true },
      { error: true },
      { runId: undefined },
    ]) {
      const value = props();
      value.message = { ...value.message, ...message };
      expect(
        messageContextActions(value).some((item) => item.id === "promote"),
      ).toBe(false);
    }
    const offline = props({ backendReady: false });
    const promote = messageContextActions(offline).find(
      (item) => item.id === "promote",
    );
    expect(promote?.disabled).toBe(true);
    promote?.onSelect();
    expect(offline.onPromote).not.toHaveBeenCalled();
  });
});
