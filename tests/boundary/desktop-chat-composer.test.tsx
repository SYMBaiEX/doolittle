// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ChatComposer,
  type ChatComposerProps,
} from "../../apps/desktop/src/renderer/chat/ChatComposer";

function composer() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const composerRef = createRef<HTMLTextAreaElement>();
  const onSubmit = vi.fn<ChatComposerProps["onSubmit"]>((event) => {
    event?.preventDefault();
  });
  const onCancelRequest = vi.fn();
  const defaults = {
    approvalBotId: "",
    approvalsVisible: false,
    backend: { phase: "ready", message: "Ready" },
    runtime: null,
    refreshRuntime: vi.fn(),
    onOpenModelsPage: vi.fn(),
    onOpenProvidersPage: vi.fn(),
    activeRequest: null,
    onCancelRequest,
    canSubmit: true,
    canQueue: false,
    draft: "Inspect the working tree",
    setDraft: vi.fn(),
    onSubmit,
    composerRef,
    queueRef: createRef<HTMLDivElement>(),
    queuedMessages: [],
    queueDispatchingId: null,
    queuePaused: false,
    resumeQueuedMessages: vi.fn(),
    setQueueAnnouncement: vi.fn(),
    clearQueuedMessages: vi.fn(),
    removeQueuedMessage: vi.fn(),
    attachedFiles: [],
    attachmentImporting: false,
    attachmentNotice: "",
    chatContextCapsule: null,
    removeChatContext: vi.fn(),
    attachmentTotalBytes: 0,
    removeContextFile: vi.fn(),
    composerValidationError: "",
    memoryMatches: { query: "", matches: [], status: "idle" },
    commandSuggestions: [],
    commandMenuDismissed: false,
    commandSelection: 0,
    setCommandSelection: vi.fn(),
    setCommandMenuDismissed: vi.fn(),
    selectCommandSuggestion: vi.fn(),
    commandCatalog: { commands: [], error: "" },
    pickContextFiles: vi.fn(),
    importAndTranscribeRecording: async () => ({ transcriptText: "" }),
    insertDictationTranscript: vi.fn(),
    selectedContextPercent: 0,
    selectedContextTone: "neutral",
    usageLoading: "",
    selectedId: "chat-1",
    modelRouteLabel: "Local offline",
    workspacePath: "",
    runningTasks: 0,
  } satisfies ChatComposerProps;
  return {
    onSubmit,
    onCancelRequest,
    render(overrides: Partial<ChatComposerProps> = {}) {
      act(() => root.render(<ChatComposer {...defaults} {...overrides} />));
    },
    button(label: string) {
      return container.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
    },
    key(key: string, init?: KeyboardEventInit) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      act(() => composerRef.current?.dispatchEvent(event));
      return event.defaultPrevented;
    },
    dispose() {
      act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("leaves IME confirmation and multiline input to the text field", () => {
  const view = composer();
  try {
    view.render();
    expect(view.button("Send message")?.disabled).toBe(false);
    expect(view.key("Enter", { isComposing: true })).toBe(false);
    expect(view.key("Enter", { shiftKey: true })).toBe(false);
    expect(view.onSubmit).not.toHaveBeenCalled();
    expect(view.key("Enter")).toBe(true);
    expect(view.onSubmit).toHaveBeenCalledOnce();
  } finally {
    view.dispose();
  }
});

it("keeps queue submission separate from stopping the active run", () => {
  const view = composer();
  try {
    view.render({ activeRequest: "run-1", canSubmit: false, canQueue: true });
    expect(view.button("Send message")).toBeNull();
    expect(view.button("Queue message")?.type).toBe("submit");
    expect(view.button("Stop response")?.type).toBe("button");
    expect(view.key("Enter")).toBe(true);
    expect(view.onSubmit).toHaveBeenCalledOnce();
    expect(view.key("Escape")).toBe(true);
    expect(view.onCancelRequest).toHaveBeenCalledExactlyOnceWith("run-1");

    view.render({
      activeRequest: "run-1",
      cancellingRequest: "run-1",
      canQueue: true,
    });
    expect(view.button("Queue message")).toBeNull();
    expect(view.button("Stopping response")?.disabled).toBe(true);
    expect(view.key("Escape")).toBe(false);
    expect(view.onCancelRequest).toHaveBeenCalledOnce();
  } finally {
    view.dispose();
  }
});
