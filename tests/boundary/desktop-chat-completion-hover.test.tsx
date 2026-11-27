// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  ChatComposer,
  type ChatComposerProps,
} from "../../apps/desktop/src/renderer/chat/ChatComposer";
import { PROMPT_LIBRARY_STORAGE_KEY } from "../../apps/desktop/src/renderer/conversation-persistence";

function composer() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const composerRef = createRef<HTMLTextAreaElement>();
  const setCommandSelection = vi.fn();
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
    draft: "/r",
    setDraft: vi.fn(),
    onSubmit: vi.fn(),
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
    setCommandSelection,
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
    setCommandSelection,
    render(overrides: Partial<ChatComposerProps> = {}) {
      act(() => root.render(<ChatComposer {...defaults} {...overrides} />));
    },
    options() {
      return Array.from(
        container.querySelectorAll<HTMLElement>('[role="option"]'),
      );
    },
    mouseMove(element: HTMLElement | undefined) {
      if (!element) throw new Error("Completion option is missing");
      act(() => {
        element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      });
    },
    dispose() {
      act(() => root.unmount());
      container.remove();
      localStorage.clear();
      vi.unstubAllGlobals();
    },
  };
}

const commands = [
  {
    command: "/review",
    category: "Review",
    description: "Inspect the current work",
  },
  {
    command: "/release",
    category: "Release",
    description: "Prepare a release",
  },
];

it("moves command completion selection with the pointer", () => {
  const view = composer();
  try {
    view.render({ commandSuggestions: commands });
    expect(view.options()[0].getAttribute("aria-selected")).toBe("true");

    view.mouseMove(view.options()[1]);
    expect(view.setCommandSelection).toHaveBeenCalledExactlyOnceWith(1);
  } finally {
    view.dispose();
  }
});

it("does not select a disabled command completion", () => {
  const view = composer();
  try {
    view.render({
      commandSuggestions: [
        commands[0],
        { ...commands[1], disabledReason: "Unavailable in this workspace" },
      ],
    });

    view.mouseMove(view.options()[1]);
    expect(view.setCommandSelection).not.toHaveBeenCalled();
  } finally {
    view.dispose();
  }
});

it("moves reusable completion selection with the pointer", () => {
  localStorage.setItem(
    PROMPT_LIBRARY_STORAGE_KEY,
    JSON.stringify([
      {
        id: "prompt-one",
        title: "First reusable",
        content: "First prompt",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "prompt-two",
        title: "Second reusable",
        content: "Second prompt",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ]),
  );
  const view = composer();
  try {
    view.render({ draft: "$" });
    expect(view.options()).toHaveLength(2);

    view.mouseMove(view.options()[1]);
    expect(view.setCommandSelection).toHaveBeenCalledExactlyOnceWith(1);
  } finally {
    view.dispose();
  }
});
