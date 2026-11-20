// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ChatTranscript } from "../../apps/desktop/src/renderer/chat/ChatTranscript";
import { getMessageActions } from "../../apps/desktop/src/renderer/chat/MessageActions";
import type { DisplayMessage } from "../../apps/desktop/src/renderer/chat/models";

const response: DisplayMessage = {
  id: "assistant:run",
  role: "assistant",
  content: "The current response.",
  createdAt: "2026-11-20T10:00:00Z",
};

it("retries the earlier page without replacing the current transcript or losing its scroll position", async () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const endRef = createRef<HTMLDivElement>();
  const noop = () => {};
  let completePage: (() => void) | undefined;
  let insertedHeight = 0;
  const page = new Promise<void>((resolve) => {
    completePage = resolve;
  });
  const onLoadEarlier = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("History service unavailable"))
    .mockReturnValue(page);
  const onRetryHistory = vi.fn();
  const props = {
    sessionId: "conversation-a",
    backendReady: true,
    activeRequest: null,
    loading: false,
    historyError: "",
    runReceipts: {},
    progress: "",
    endRef,
    forkingMessageId: "",
    copyStates: {},
    speakingMessageId: "",
    speechSupported: false,
    onBranch: noop,
    onCopy: noop,
    onRead: noop,
    onRetryHistory,
    onStopReading: noop,
    onSelectPrompt: noop,
    onLoadEarlier,
  };

  try {
    act(() => {
      root.render(
        <ChatTranscript {...props} hasEarlierMessages messages={[response]} />,
      );
    });
    const transcript = container.querySelector<HTMLElement>('[role="log"]');
    const row = container.querySelector<HTMLElement>("[data-message-role]");
    const button = container.querySelector<HTMLButtonElement>(
      '[aria-label="Load earlier messages"]',
    );
    if (!transcript || !row || !button)
      throw new Error("Transcript is missing.");
    transcript.scrollTop = 20;
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(0, 50 + insertedHeight - transcript.scrollTop, 100, 80),
    );

    await act(async () => button.click());
    expect(transcript.textContent).toContain(response.content);
    expect(transcript.querySelector('[role="alert"]')?.textContent).toBe(
      "Earlier messages could not be loaded.",
    );
    expect(button.getAttribute("aria-label")).toBe(
      "Retry loading earlier messages",
    );

    act(() => button.click());
    transcript.scrollTop = 40;
    insertedHeight = 90;
    await act(async () => {
      root.render(
        <ChatTranscript
          {...props}
          messages={[
            {
              id: "earlier",
              role: "user",
              content: "An earlier prompt.",
              createdAt: "2026-11-20T09:00:00Z",
            },
            response,
          ]}
        />,
      );
      completePage?.();
    });

    expect(transcript.scrollTop).toBe(130);
    expect(transcript.style.getPropertyValue("overflow-anchor")).toBe("");
    expect(onLoadEarlier).toHaveBeenCalledTimes(2);
    expect(onRetryHistory).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }
});

it("keeps retry available when a failed response cannot be forked", () => {
  const onBranch = vi.fn();
  const actions = getMessageActions({
    message: { ...response, error: true },
    backendReady: true,
    activeRequest: null,
    forkingMessageId: "",
    speechSupported: false,
    speakingMessageId: "",
    onBranch,
    onCopy: vi.fn(),
    onRead: vi.fn(),
    onStopReading: vi.fn(),
  });

  expect(actions.find((action) => action.id === "fork")?.disabled).toBe(true);
  const retry = actions.find((action) => action.id === "retry");
  expect(retry?.disabled).toBe(false);
  retry?.onSelect();
  expect(onBranch).toHaveBeenCalledWith(
    expect.objectContaining({ id: response.id }),
    "retry",
  );
});
