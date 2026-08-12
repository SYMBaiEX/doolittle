// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatMessageActionsState,
  useChatMessageActions,
} from "./useChatMessageActions";

class TestUtterance {
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly text: string) {}
}

let latest: ChatMessageActionsState | undefined;

function Probe() {
  latest = useChatMessageActions();
  return null;
}

describe("useChatMessageActions", () => {
  let container: HTMLDivElement;
  let root: Root;
  const cancel = vi.fn();
  const speak = vi.fn();
  const writeText = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    cancel.mockReset();
    speak.mockReset();
    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { cancel, speak },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: TestUtterance,
    });
    latest = undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("tracks successful copies briefly", async () => {
    await act(async () => {
      await latest?.copyMessage("message-1", "Useful answer");
    });
    expect(writeText).toHaveBeenCalledWith("Useful answer");
    expect(latest?.copyStates).toEqual({ "message-1": "copied" });

    act(() => vi.advanceTimersByTime(1_500));
    expect(latest?.copyStates).toEqual({});
  });

  it("keeps a renewed copy status for the full timeout", async () => {
    await act(async () => {
      await latest?.copyMessage("message-1", "First copy");
    });
    act(() => vi.advanceTimersByTime(1_000));
    await act(async () => {
      await latest?.copyMessage("message-1", "Second copy");
    });
    act(() => vi.advanceTimersByTime(500));
    expect(latest?.copyStates).toEqual({ "message-1": "copied" });

    act(() => vi.advanceTimersByTime(1_000));
    expect(latest?.copyStates).toEqual({});
  });

  it("reports unavailable copies without touching the clipboard", async () => {
    await act(async () => {
      await latest?.copyMessage("message-2", "");
    });
    expect(writeText).not.toHaveBeenCalled();
    expect(latest?.copyStates).toEqual({ "message-2": "failed" });
  });

  it("reads completed assistant messages and clears the active item", () => {
    act(() => {
      latest?.readMessage({
        content: "A concise answer.",
        createdAt: "2026-08-12T00:00:00.000Z",
        id: "assistant-1",
        role: "assistant",
      });
    });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(latest?.speakingMessageId).toBe("assistant-1");

    const utterance = speak.mock.calls[0]?.[0] as TestUtterance;
    expect(utterance.text).toBe("A concise answer.");
    act(() => utterance.onend?.());
    expect(latest?.speakingMessageId).toBe("");
  });

  it("ignores pending and user messages and stops active speech", () => {
    act(() => {
      latest?.readMessage({
        content: "Still streaming",
        createdAt: "2026-08-12T00:00:00.000Z",
        id: "assistant-2",
        pending: true,
        role: "assistant",
      });
      latest?.readMessage({
        content: "User text",
        createdAt: "2026-08-12T00:00:00.000Z",
        id: "user-1",
        role: "user",
      });
      latest?.stopSpeaking();
    });
    expect(speak).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(latest?.speakingMessageId).toBe("");
  });
});
