// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ChatComposer,
  type ChatComposerProps,
} from "../../apps/desktop/src/renderer/chat/ChatComposer";

const reviewCommand = {
  command: "/review",
  category: "Review",
  description: "Inspect the current work",
};

function composer() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const composerRef = createRef<HTMLTextAreaElement>();
  const onSubmit = vi.fn<ChatComposerProps["onSubmit"]>((event) => {
    event?.preventDefault();
  });
  const selectCommandSuggestion = vi.fn();
  const defaults = {
    approvalBotId: "",
    approvalsVisible: false,
    backend: { phase: "ready", message: "Ready" },
    runtime: null,
    refreshRuntime: vi.fn(),
    onOpenModelsPage: vi.fn(),
    onOpenProvidersPage: vi.fn(),
    activeRequest: null,
    onCancelRequest: vi.fn(),
    canSubmit: true,
    canQueue: false,
    draft: "/rev",
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
    commandSuggestions: [reviewCommand],
    commandMenuDismissed: false,
    commandSelection: 0,
    setCommandSelection: vi.fn(),
    setCommandMenuDismissed: vi.fn(),
    selectCommandSuggestion,
    commandCatalog: { commands: [reviewCommand], error: "" },
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
    selectCommandSuggestion,
    render(overrides: Partial<ChatComposerProps> = {}) {
      act(() => root.render(<ChatComposer {...defaults} {...overrides} />));
    },
    enter() {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
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

it("Enter completes the selected slash command instead of submitting partial text", () => {
  const view = composer();
  try {
    view.render();

    expect(view.enter()).toBe(true);
    expect(view.selectCommandSuggestion).toHaveBeenCalledExactlyOnceWith(
      reviewCommand,
    );
    expect(view.onSubmit).not.toHaveBeenCalled();
  } finally {
    view.dispose();
  }
});

it("Enter does not submit partial text when the selected command is disabled", () => {
  const view = composer();
  try {
    const disabledCommand = {
      ...reviewCommand,
      disabledReason: "Unavailable in this workspace",
    };
    view.render({ commandSuggestions: [disabledCommand] });

    expect(view.enter()).toBe(true);
    expect(view.selectCommandSuggestion).not.toHaveBeenCalled();
    expect(view.onSubmit).not.toHaveBeenCalled();
  } finally {
    view.dispose();
  }
});
