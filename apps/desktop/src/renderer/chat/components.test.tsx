import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DesktopRunUpdate } from "../../shared/contracts";
import { ChatComposer, type ChatComposerProps } from "./ChatComposer";
import { ChatMessage } from "./ChatMessage";
import { ChatTranscript } from "./ChatTranscript";
import { RunReceiptView } from "./RunReceiptView";
import { Welcome } from "./Welcome";

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

describe("chat presentation components", () => {
  it("keeps composer controls, attachment affordance, and context meter together", () => {
    const props = {
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
      setQueuePaused: () => undefined,
      setQueueAnnouncement: () => undefined,
      clearQueuedMessages: () => undefined,
      removeQueuedMessage: () => undefined,
      attachedFiles: [],
      attachmentTotalBytes: 0,
      removeContextFile: () => undefined,
      composerValidationError: "",
      memoryMatches: { query: "", matches: [], status: "idle" },
      commandSuggestions: [],
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
    } as unknown as ChatComposerProps;
    const html = renderToStaticMarkup(<ChatComposer {...props} />);
    expect(html).toContain('class="chat-composer"');
    expect(html).toContain('aria-label="Attach file context"');
    expect(html).toContain('aria-label="Message Doolittle"');
    expect(html).toContain('class="chat-context-meter neutral"');
    expect(html).toContain('aria-label="Send message"');
  });

  it("keeps the welcome prompts and project-specific copy intact", () => {
    const html = renderToStaticMarkup(
      <Welcome onSelect={() => undefined} projectName="Doolittle" />,
    );
    expect(html).toContain('class="chat-welcome"');
    expect(html).toContain("Start a focused conversation for Doolittle.");
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
    expect(html).toContain('class="chat-run-receipt"');
    expect(html).toContain("Run complete");
    expect(html).toContain("run-1");
    expect(html.match(/<li>/gu)).toHaveLength(1);
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
        onSelectPrompt={() => undefined}
        onStopReading={() => undefined}
        progress=""
        runReceipts={{}}
        speakingMessageId=""
        speechSupported={false}
      />,
    );
    expect(html).toContain('class="chat-messages"');
    expect(html).toContain("Give Doolittle");
  });
});
