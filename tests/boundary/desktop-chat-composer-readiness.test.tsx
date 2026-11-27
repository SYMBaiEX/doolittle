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
  const defaults = {
    approvalBotId: "",
    approvalsVisible: false,
    backend: { phase: "degraded", message: "Runtime unavailable" },
    runtime: null,
    refreshRuntime: vi.fn(),
    onOpenModelsPage: vi.fn(),
    onOpenProvidersPage: vi.fn(),
    activeRequest: null,
    onCancelRequest: vi.fn(),
    canSubmit: false,
    canQueue: false,
    draft: "A draft written while the runtime recovers",
    setDraft: vi.fn(),
    onSubmit: vi.fn(),
    composerRef: createRef<HTMLTextAreaElement>(),
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
    render(overrides: Partial<ChatComposerProps> = {}) {
      act(() => root.render(<ChatComposer {...defaults} {...overrides} />));
    },
    input() {
      return container.querySelector<HTMLTextAreaElement>("textarea");
    },
    button(label: string) {
      return container.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
    },
    dispose() {
      act(() => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("keeps the draft editable and focused when the runtime degrades", () => {
  const view = composer();
  try {
    view.render({
      backend: { phase: "ready", message: "Ready" },
      canSubmit: true,
    });
    const input = view.input();
    if (!input) throw new Error("Composer input is missing");
    input.focus();

    view.render();
    expect(view.input()).toBe(input);
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(input.placeholder).toBe("Message Doolittle…");
    expect(view.button("Send message")?.disabled).toBe(true);
  } finally {
    view.dispose();
  }
});

it("still disables drafting on explicitly read-only surfaces", () => {
  const view = composer();
  try {
    view.render({
      backend: { phase: "ready", message: "Ready" },
      canDraft: false,
    });
    expect(view.input()?.disabled).toBe(true);
  } finally {
    view.dispose();
  }
});
