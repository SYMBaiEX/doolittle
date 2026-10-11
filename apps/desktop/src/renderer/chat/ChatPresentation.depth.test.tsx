// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

  it("keeps inspector selection text-only and arrow navigation roving", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const frame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });
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
      const tabs = Array.from(
        host.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      );
      expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
      expect(tabs[0]?.className).not.toMatch(
        /aria-selected:(?:bg|border)|border-b-2/u,
      );
      tabs[0]?.focus();
      await act(async () =>
        tabs[0]?.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
        ),
      );
      expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(tabs[1]);
      expect(tabs[0]?.tabIndex).toBe(-1);
    } finally {
      await act(async () => root.unmount());
      frame.mockRestore();
      host.remove();
    }
  });
});
