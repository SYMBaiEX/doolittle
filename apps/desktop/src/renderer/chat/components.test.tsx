// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { savePromptLibrary } from "../conversation-persistence";
import {
  CHAT_COMPOSER_MAX_HEIGHT,
  CHAT_COMPOSER_MIN_HEIGHT,
  ChatComposer,
  type ChatComposerProps,
  chatComposerHeight,
} from "./ChatComposer";
import { ChatMessage } from "./ChatMessage";
import { ChatTranscript } from "./ChatTranscript";
import { MessageActions } from "./MessageActions";
import { RunReceiptView } from "./RunReceiptView";
import { Welcome } from "./Welcome";

const composerStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    clear: () => composerStorage.clear(),
    getItem: (key: string) => composerStorage.get(key) ?? null,
    removeItem: (key: string) => composerStorage.delete(key),
    setItem: (key: string, value: string) => composerStorage.set(key, value),
  },
});

function runUpdate(
  type: DesktopRunUpdate["type"] = "completed",
): DesktopRunUpdate {
  return {
    type,
    sessionId: "session-1",
    run: {
      runId: "run-1",
      sessionId: "session-1",
      roomId: "room-1",
      source: "desktop",
      message: "Review this",
      runDepth: "standard",
      configuredMaxIterations: 8,
      observedActionCount: 1,
      progressMode: "all",
      status: "complete",
      localMutations: [],
      pendingApprovals: 0,
      startedAt: "2026-08-09T10:00:00.000Z",
      updatedAt: "2026-08-09T10:00:01.000Z",
    },
  };
}

function composerProps(
  overrides: Partial<ChatComposerProps> = {},
): ChatComposerProps {
  return {
    activeProject: null,
    projects: [],
    isNewConversation: false,
    backend: { phase: "stopped", message: "" },
    runtime: { provider: "test", model: "test-model", plugins: {} },
    refreshRuntime: () => undefined,
    onOpenModelsPage: () => undefined,
    onOpenProvidersPage: () => undefined,
    activeRequest: null,
    canSubmit: true,
    draft: "hello",
    setDraft: () => undefined,
    onSubmit: () => undefined,
    composerRef: { current: null },
    queueRef: { current: null },
    queuedMessages: [],
    queuePaused: false,
    resumeQueuedMessages: () => undefined,
    setQueueAnnouncement: () => undefined,
    clearQueuedMessages: () => undefined,
    removeQueuedMessage: () => undefined,
    attachedFiles: [],
    chatContextCapsule: null,
    removeChatContext: () => undefined,
    attachmentTotalBytes: 0,
    removeContextFile: () => undefined,
    composerValidationError: "",
    memoryMatches: { query: "", matches: [], status: "idle" },
    commandSuggestions: [],
    commandMenuDismissed: false,
    commandSelection: 0,
    setCommandSelection: () => undefined,
    setCommandMenuDismissed: () => undefined,
    selectCommandSuggestion: () => undefined,
    commandCatalog: { commands: [], error: "" },
    pickContextFiles: () => undefined,
    importAndTranscribeRecording: async () => ({ transcriptText: "" }),
    insertDictationTranscript: () => undefined,
    selectedContext: undefined,
    selectedContextPercent: 0,
    selectedContextTone: "neutral",
    selectedUsageError: undefined,
    usageLoading: "",
    selectedId: "session-1",
    modelRouteLabel: "test · test-model",
    workspacePath: "/workspace",
    pendingApprovals: 0,
    runningTasks: 0,
    ...overrides,
  } as unknown as ChatComposerProps;
}

describe("chat presentation components", () => {
  it("grows multiline drafts up to the capped composer height and resets", () => {
    expect(chatComposerHeight(96)).toBe(96);
    expect(chatComposerHeight(CHAT_COMPOSER_MAX_HEIGHT + 80)).toBe(
      CHAT_COMPOSER_MAX_HEIGHT,
    );
    expect(chatComposerHeight(0)).toBe(CHAT_COMPOSER_MIN_HEIGHT);
  });

  it("keeps composer controls, attachment affordance, and context meter together", () => {
    const props = composerProps();
    const html = renderToStaticMarkup(<ChatComposer {...props} />);
    expect(html).toContain('class="chat-composer"');
    expect(html).toContain('aria-label="Attach multiple files"');
    expect(html).toContain("Attach files");
    expect(html).toContain('aria-label="Message Doolittle"');
    expect(html).toContain('class="chat-context-meter neutral"');
    expect(html).toContain('aria-label="Send message"');
  });

  it("inserts the active dollar-prefix prompt on Enter without submitting", () => {
    window.localStorage.clear();
    savePromptLibrary(window.localStorage, [
      {
        id: "release-review",
        title: "Release review",
        content: "Review the release carefully.",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      },
    ]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let submitCount = 0;

    function Probe() {
      const [draft, setDraft] = useState("$release");
      return (
        <ChatComposer
          {...composerProps({
            draft,
            setDraft,
            onSubmit: () => {
              submitCount += 1;
            },
          })}
        />
      );
    }

    act(() => root.render(<Probe />));
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Message Doolittle"]',
    );
    expect(container.textContent).toContain("Release review");
    act(() => {
      textarea?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });

    expect(textarea?.value).toBe("Review the release carefully.");
    expect(submitCount).toBe(0);
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("loads an Eliza skill and inserts its official command on Tab", async () => {
    window.localStorage.clear();
    const requestAgent = vi.fn(async (request: { path: string }) => ({
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        request.path === "/skills"
          ? {
              skills: [
                {
                  slug: "release/check",
                  title: "Release check",
                  description: "Verify a release.",
                  commandName: "release-check",
                  userInvocable: true,
                },
              ],
            }
          : { approvals: [] },
      ),
    }));
    Object.defineProperty(window, "doolittle", {
      configurable: true,
      value: {
        requestAgent,
        cancelAgentRequest: vi.fn(async () => undefined),
      },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let submitCount = 0;

    function Probe() {
      const [draft, setDraft] = useState("$release");
      return (
        <ChatComposer
          {...composerProps({
            backend: { phase: "ready", message: "" },
            draft,
            setDraft,
            onSubmit: () => {
              submitCount += 1;
            },
          })}
        />
      );
    }

    await act(async () => root.render(<Probe />));
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Release check"),
    );
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Message Doolittle"]',
    );
    act(() => {
      textarea?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
      );
    });

    expect(textarea?.value).toBe("/release-check");
    expect(submitCount).toBe(0);
    expect(requestAgent).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/skills" }),
    );
    act(() => root.unmount());
    container.remove();
  });

  it("renders multiple selected files compactly and omits empty memory chrome", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        {...composerProps({
          attachedFiles: [
            {
              id: "file-1",
              name: "README.md",
              kind: "document",
              mimeType: "text/markdown",
              sizeBytes: 1_024,
              sha256: "a".repeat(64),
            },
            {
              id: "file-2",
              name: "app.ts",
              kind: "document",
              mimeType: "text/typescript",
              sizeBytes: 2_048,
              sha256: "b".repeat(64),
            },
          ],
          attachmentTotalBytes: 3_072,
          memoryMatches: { query: "draft", matches: [], status: "ready" },
        })}
      />,
    );

    expect(html).toContain("README.md");
    expect(html).toContain("app.ts");
    expect(html).toContain("2 / 8 files");
    expect(html).toContain("Add files");
    expect(html).not.toContain("No saved profile matches");
    expect(html).not.toContain('class="chat-memory-matches"');
  });

  it("renders source handoff as a compact removable capsule", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        {...composerProps({
          chatContextCapsule: {
            kind: "diff",
            path: "src/app.ts",
            source: "working-tree",
            content:
              '<review_context path="src/app.ts">secret</review_context>',
          },
        })}
      />,
    );
    expect(html).toContain('class="chat-context-capsule"');
    expect(html).toContain("Diff · src/app.ts");
    expect(html).toContain("working-tree");
    expect(html).toContain(
      'aria-label="Remove src/app.ts from message context"',
    );
    expect(html).not.toContain("secret");
  });

  it("renders queued prompts without their hidden capsule source", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        {...composerProps({
          queuedMessages: [
            {
              id: "queued-1",
              sessionId: "session-1",
              content: "Review the file",
              capsule: {
                kind: "file",
                path: "src/app.ts",
                content:
                  '<file_context path="src/app.ts">hidden source</file_context>',
              },
              attachments: [],
            },
          ],
        })}
      />,
    );

    expect(html).toContain("Review the file");
    expect(html).not.toContain("hidden source");
    expect(html).not.toContain("&lt;file_context");
  });

  it("renders browser evidence as a compact removable capsule", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        {...composerProps({
          chatContextCapsule: {
            kind: "browser",
            path: "http://127.0.0.1:3000",
            source: "capture",
            content:
              '<browser_evidence action="capture" url="http://127.0.0.1:3000">large receipt</browser_evidence>',
          },
        })}
      />,
    );
    expect(html).toContain("Browser · http://127.0.0.1:3000");
    expect(html).toContain("capture");
    expect(html).toContain(
      'aria-label="Remove http://127.0.0.1:3000 from message context"',
    );
    expect(html).not.toContain("large receipt");
  });

  it("keeps sent source context compact in the transcript", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        actions={null}
        message={{
          id: "user-1",
          role: "user",
          content: "Review src/app.ts.",
          contextCapsule: {
            kind: "file",
            path: "src/app.ts",
          },
          createdAt: "2026-08-13T00:00:00.000Z",
        }}
      />,
    );
    expect(html).toContain("Review src/app.ts.");
    expect(html).toContain("Source");
    expect(html).toContain("src/app.ts");
    expect(html).not.toContain("<file_context");
  });

  it("labels terminal context as a first-class transcript capsule", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        actions={null}
        message={{
          id: "user-terminal-1",
          role: "user",
          content: "Please explain the command output.",
          contextCapsule: {
            kind: "terminal",
            path: "Terminal",
          },
          createdAt: "2026-08-13T00:00:00.000Z",
        }}
      />,
    );
    expect(html).toContain("Terminal · Terminal");
    expect(html).toContain(
      'aria-label="Attached terminal context for Terminal"',
    );
  });

  it("connects slash-command selection to the composer for assistive technology", () => {
    const props = composerProps({
      backend: { phase: "ready", message: "" },
      draft: "/rev",
      commandSuggestions: [
        {
          command: "/review",
          description: "Review the current workspace",
          category: "Workspace",
        },
        {
          command: "/runtime",
          description: "Inspect runtime health",
          category: "Runtime",
        },
      ],
      commandSelection: 1,
    });
    const html = renderToStaticMarkup(<ChatComposer {...props} />);
    expect(html).toContain('id="chat-command-completions"');
    expect(html).toContain('id="chat-command-option-1"');
    expect(html).toContain('aria-activedescendant="chat-command-option-1"');
    expect(html).toContain('aria-controls="chat-command-completions"');
    expect(html).toContain('aria-haspopup="listbox"');
  });

  it("keeps the active command valid when suggestions shrink", () => {
    const html = renderToStaticMarkup(
      <ChatComposer
        {...composerProps({
          backend: { phase: "ready", message: "" },
          draft: "/rev",
          commandSuggestions: [
            {
              command: "/review",
              description: "Review the current workspace",
              category: "Workspace",
            },
            {
              command: "/runtime",
              description: "Inspect runtime health",
              category: "Runtime",
            },
          ],
          commandSelection: 99,
        })}
      />,
    );
    expect(html).toContain('aria-activedescendant="chat-command-option-1"');
    expect(html).toMatch(
      /aria-selected="true"[^>]*id="chat-command-option-1"/s,
    );
    expect(html).toMatch(
      /aria-selected="false"[^>]*id="chat-command-option-0"/s,
    );
  });

  it("keeps the welcome prompts and project-specific copy intact", () => {
    const html = renderToStaticMarkup(
      <Welcome onSelect={() => undefined} projectName="Doolittle" />,
    );
    expect(html).toContain('class="chat-welcome"');
    expect(html).toContain("A focused conversation for Doolittle.");
    expect(html.match(/class="starter-grid"/gu)).toHaveLength(1);
    expect(html.match(/type="button"/gu)).toHaveLength(3);
  });

  it("renders receipts and omits heartbeat-only events", () => {
    const completed = runUpdate();
    const heartbeat = runUpdate("heartbeat");
    const html = renderToStaticMarkup(
      <RunReceiptView
        pending={false}
        receipt={{ latest: completed, events: [heartbeat, completed] }}
      />,
    );
    expect(html).toContain("chat-run-receipt");
    expect(html).toContain("Run complete");
    expect(html).toContain("run-1");
    expect(html.match(/<li(?:\s|>)/gu)).toHaveLength(1);
  });

  it("keeps retry available for an errored assistant response", () => {
    const html = renderToStaticMarkup(
      <MessageActions
        activeRequest={null}
        backendReady
        copyState={undefined}
        forkingMessageId=""
        message={{
          id: "assistant-error",
          role: "assistant",
          content: "Provider unavailable",
          createdAt: "2026-08-09T10:00:00.000Z",
          error: true,
        }}
        onBranch={() => undefined}
        onCopy={() => undefined}
        onRead={() => undefined}
        onStopReading={() => undefined}
        speakingMessageId=""
        speechSupported={false}
      />,
    );
    expect(html).toContain("Retry");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("Read");
  });

  it("renders message attachments and delegates action controls", () => {
    const html = renderToStaticMarkup(
      <ChatMessage
        actions={<div className="chat-message-actions">Actions</div>}
        message={{
          id: "user-1",
          role: "user",
          content: "Please inspect this",
          createdAt: "2026-08-09T10:00:00.000Z",
          attachments: [
            {
              id: "file-1",
              name: "brief.md",
              kind: "document",
              mimeType: "text/markdown",
              sizeBytes: 2048,
              sha256: "hash",
            },
          ],
        }}
      />,
    );
    expect(html).toContain('aria-label="Message attachments"');
    expect(html).toContain("brief.md");
    expect(html).toContain("document · 2 KB");
    expect(html).toContain('class="chat-message-footer"');
    expect(html).toContain('class="chat-message-actions"');
    expect(html.indexOf('class="chat-message-footer"')).toBeGreaterThan(
      html.indexOf('class="chat-message-body"'),
    );
  });

  it("keeps the transcript wrapper and blank-state behavior in one component", () => {
    const html = renderToStaticMarkup(
      <ChatTranscript
        activeRequest={null}
        backendReady
        copyStates={{}}
        endRef={{ current: null }}
        forkingMessageId=""
        historyError=""
        loading={false}
        messages={[]}
        onBranch={() => undefined}
        onCopy={() => undefined}
        onRead={() => undefined}
        onRetryHistory={() => undefined}
        onSelectPrompt={() => undefined}
        onStopReading={() => undefined}
        progress=""
        runReceipts={{}}
        speakingMessageId=""
        speechSupported={false}
      />,
    );
    expect(html).toContain('class="chat-messages"');
    expect(html).toContain("What are you");
  });

  it("offers retry when conversation history is unavailable", () => {
    const html = renderToStaticMarkup(
      <ChatTranscript
        activeRequest={null}
        backendReady
        copyStates={{}}
        endRef={{ current: null }}
        forkingMessageId=""
        historyError="History offline"
        loading={false}
        messages={[]}
        onBranch={() => undefined}
        onCopy={() => undefined}
        onRead={() => undefined}
        onRetryHistory={() => undefined}
        onSelectPrompt={() => undefined}
        onStopReading={() => undefined}
        progress=""
        runReceipts={{}}
        speakingMessageId=""
        speechSupported={false}
      />,
    );
    expect(html).toContain("History offline");
    expect(html).toContain(">Retry</button>");
  });
});
