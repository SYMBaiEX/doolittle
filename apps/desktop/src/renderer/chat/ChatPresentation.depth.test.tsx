// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatTranscript, type ChatTranscriptProps } from "./ChatTranscript";
import { CompanionInspector, type InspectorTab } from "./CompanionInspector";
import { Welcome } from "./Welcome";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function transcriptProps(
  overrides: Partial<ChatTranscriptProps> = {},
): ChatTranscriptProps {
  return {
    loading: false,
    historyError: "",
    messages: [],
    runReceipts: {},
    progress: "",
    endRef: { current: null },
    backendReady: true,
    activeRequest: null,
    forkingMessageId: "",
    copyStates: {},
    speechSupported: false,
    speakingMessageId: "",
    onBranch: () => undefined,
    onCopy: () => undefined,
    onRead: () => undefined,
    onRetryHistory: () => undefined,
    onStopReading: () => undefined,
    onSelectPrompt: () => undefined,
    ...overrides,
  };
}

const response = {
  id: "assistant-a",
  role: "assistant" as const,
  content: "The existing response stays readable.",
  createdAt: "2026-10-11T10:00:00Z",
};

describe("chat presentation depth", () => {
  it.each([true, false])(
    "retains existing messages during history recovery, loading=%s",
    (loading) => {
      const html = renderToStaticMarkup(
        <ChatTranscript
          {...transcriptProps({
            loading,
            historyError: loading ? "" : "Local history is unavailable.",
            messages: [response],
          })}
        />,
      );
      expect(html).toContain(response.content);
      expect(html).not.toContain("What’s on your mind?");
      expect(html).toContain(
        loading ? "Refreshing conversation" : "Retry history",
      );
    },
  );

  it("attributes streamed replies to the selected specialist without silencing status updates", () => {
    const html = renderToStaticMarkup(
      <ChatTranscript
        {...transcriptProps({
          botName: "Researcher",
          activeRequest: "run-a",
          messages: [{ ...response, content: "", pending: true }],
        })}
      />,
    );
    expect(html).toContain(">Researcher</span>");
    expect(html).toContain("Researcher is working");
    expect(html).not.toContain('aria-busy="true"');
    expect(html).toContain('aria-relevant="additions"');
  });

  it("uses a semantic flat starter list without decorative numbering", () => {
    const html = renderToStaticMarkup(<Welcome onSelect={() => undefined} />);
    expect(html).toContain('<ul aria-label="Conversation starters"');
    expect(html.match(/<li>/gu)).toHaveLength(3);
    expect(html).not.toContain("starter-index");
  });

  it("uses a native inspector view selector without a persistent tab strip", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Probe() {
      const [tab, setTab] = useState<InspectorTab>("details");
      return (
        <CompanionInspector
          active={false}
          contextLabel="Not measured"
          messageCount={0}
          onClose={() => undefined}
          onInsertContext={() => undefined}
          onOpenFullView={() => undefined}
          onTabChange={setTab}
          sessionId="session-a"
          tab={tab}
          title="A conversation"
          workspacePath=""
        />
      );
    }
    try {
      await act(async () => root.render(<Probe />));
      expect(host.querySelector('[role="tablist"]')).toBeNull();
      const selector = host.querySelector<HTMLSelectElement>("select");
      expect(selector?.value).toBe("details");
      expect(selector?.labels?.[0]?.textContent).toBe("View");
      await act(async () => {
        if (!selector) return;
        selector.value = "library";
        selector.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(selector?.value).toBe("library");
      expect(
        host.querySelector('section[aria-label="Library"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
