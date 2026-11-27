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
    query<T extends Element>(selector: string) {
      return container.querySelector<T>(selector);
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
    expect(view.button("Queue message")?.disabled).toBe(false);
    expect(view.button("Stop response")?.type).toBe("button");
    expect(view.query<HTMLElement>(".chat-send-behavior")?.textContent).toBe(
      "Enter queues behind the current response.",
    );
    expect(
      view.query<HTMLElement>("#chat-composer-hint-chat-1")?.textContent,
    ).toBe("Enter to queue. Escape to stop. Shift Enter for a new line.");
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
    expect(view.query<HTMLElement>(".chat-send-behavior")?.textContent).toBe(
      "Stopping the current response; queueing is paused.",
    );
    expect(view.button("Stopping response")?.disabled).toBe(true);
    expect(view.key("Escape")).toBe(false);
    expect(view.onCancelRequest).toHaveBeenCalledOnce();
  } finally {
    view.dispose();
  }
});

it("shows a disabled queue control when an active-run draft cannot queue", () => {
  const view = composer();
  try {
    view.render({ activeRequest: "run-1", canQueue: false });
    expect(view.button("Queue message")?.disabled).toBe(true);
    expect(
      view.button("Queue message")?.getAttribute("aria-keyshortcuts"),
    ).toBe(null);
    expect(view.query<HTMLElement>(".chat-send-behavior")?.textContent).toBe(
      "Queueing is unavailable for this draft.",
    );
    expect(
      view.query<HTMLElement>("#chat-composer-hint-chat-1")?.textContent,
    ).toBe(
      "Queueing is unavailable for this draft. Escape to stop. Shift Enter for a new line.",
    );
    expect(view.key("Enter")).toBe(true);
    expect(view.onSubmit).not.toHaveBeenCalled();

    view.render({ activeRequest: "run-1", canQueue: false, draft: "" });
    expect(view.button("Queue message")).toBeNull();
    expect(view.query<HTMLElement>(".chat-send-behavior")).toBeNull();
  } finally {
    view.dispose();
  }
});

it("exposes command completions through combobox semantics", () => {
  const view = composer();
  try {
    const input = () => view.query<HTMLTextAreaElement>("textarea");
    view.render();
    expect(input()?.getAttribute("role")).toBe("combobox");
    expect(input()?.getAttribute("aria-expanded")).toBe("false");
    expect(input()?.hasAttribute("aria-controls")).toBe(false);

    view.render({
      commandSuggestions: [
        {
          command: "/review",
          category: "Review",
          description: "Inspect the current work",
        },
      ],
    });
    expect(input()?.getAttribute("aria-expanded")).toBe("true");
    expect(input()?.getAttribute("aria-controls")).toBe(
      "chat-command-completions-chat-1",
    );
    expect(input()?.getAttribute("aria-activedescendant")).toBe(
      "chat-command-option-0-chat-1",
    );
    expect(view.query<HTMLElement>('[role="listbox"]')?.id).toBe(
      "chat-command-completions-chat-1",
    );
    expect(
      view.query<HTMLElement>('[role="option"]')?.getAttribute("aria-selected"),
    ).toBe("true");
  } finally {
    view.dispose();
  }
});

it("uses validation alert semantics without a conflicting live region", () => {
  const view = composer();
  try {
    view.render({ composerValidationError: "Message cannot be empty" });
    const alert = view.query<HTMLElement>(".chat-composer-validation");
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.hasAttribute("aria-live")).toBe(false);
  } finally {
    view.dispose();
  }
});

it("hides the workspace picker once a chat is bound", () => {
  const view = composer();
  try {
    const workspace = {
      projects: [{ id: "project", name: "Coding", primaryPath: "/code" }],
      onChooseRepository: vi.fn(),
      onOpenProjectManager: vi.fn(),
      onSelectProjectForNewChat: vi.fn(),
      workspaceTarget: { kind: "unconfirmed" },
    } satisfies Partial<ChatComposerProps>;
    const trigger = () =>
      view.query<HTMLButtonElement>('button[aria-label^="Choose workspace."]');
    view.render(workspace);
    expect(trigger()).not.toBeNull();
    view.render({ ...workspace, workspaceBound: true });
    expect(trigger()).toBeNull();
    view.render({
      ...workspace,
      workspaceBound: true,
      workspaceTarget: {
        kind: "local",
        projectId: "project",
        name: "Coding",
        path: "/code",
      },
    });
    expect(trigger()).toBeNull();
    view.render({
      ...workspace,
      workspaceBound: false,
      workspaceTarget: { kind: "pending", name: "Coding" },
    });
    expect(trigger()).not.toBeNull();
  } finally {
    view.dispose();
  }
});
