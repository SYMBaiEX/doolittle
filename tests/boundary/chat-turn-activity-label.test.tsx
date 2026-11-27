import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "../../apps/desktop/src/renderer/chat/ChatMessage";
import type {
  DisplayMessage,
  RunReceipt,
} from "../../apps/desktop/src/renderer/chat/models";
import type { DesktopRunUpdate } from "../../apps/desktop/src/shared/contracts";

function receipt(
  fields?: Partial<DesktopRunUpdate["run"]>,
  type: DesktopRunUpdate["type"] = "completed",
): RunReceipt {
  const run = {
    runId: "run-a",
    sessionId: "session-a",
    roomId: "session-a",
    source: "desktop",
    message: "",
    runDepth: "standard",
    configuredMaxIterations: 4,
    observedActionCount: 0,
    progressMode: "all",
    status: "complete",
    localMutations: [],
    pendingApprovals: 0,
    startedAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:42.000Z",
    endedAt: "2026-11-20T10:00:42.000Z",
    terminalReason: "completed",
    ...fields,
  } as DesktopRunUpdate["run"];
  return {
    latest: { type, sessionId: run.sessionId, run },
    events: [],
  };
}

function message(fields?: Partial<DisplayMessage>): DisplayMessage {
  return {
    id: "assistant:run-a",
    runId: "run-a",
    role: "assistant",
    content: "Done.",
    createdAt: "2026-11-20T10:00:42.000Z",
    ...fields,
  };
}

function renderMessage(
  messageFields?: Partial<DisplayMessage>,
  runReceipt?: RunReceipt,
): string {
  return renderToStaticMarkup(
    <ChatMessage
      actions={null}
      message={message(messageFields)}
      receipt={runReceipt}
    />,
  );
}

describe("ChatMessage turn activity label", () => {
  it("renders the settled turn aggregate in the quiet header metadata", () => {
    const markup = renderMessage(
      undefined,
      receipt({
        observedActionCount: 7,
        localMutations: [
          {
            action: "PATCH_FILE",
            resolvedPath: "/repo/src/a.ts",
            success: true,
            recordedAt: "2026-11-20T10:00:20.000Z",
          },
          {
            action: "WRITE_FILE",
            resolvedPath: "/repo/src/b.ts",
            success: true,
            recordedAt: "2026-11-20T10:00:21.000Z",
          },
          {
            action: "PATCH_FILE",
            resolvedPath: "/repo/src/a.ts",
            success: true,
            recordedAt: "2026-11-20T10:00:22.000Z",
          },
        ],
      }),
    );

    expect(markup).toContain('class="chat-turn-activity-summary"');
    expect(markup).toContain("7 tool calls · 2 files changed · 42s");
  });

  it("still marks a simple settled response with its honest duration", () => {
    const markup = renderMessage(undefined, receipt());

    expect(markup).toContain("42s");
    expect(markup).not.toContain("tool call");
    expect(markup).not.toContain("file changed");
  });

  it("does not label pending or active turns", () => {
    const active = receipt(
      {
        status: "acting",
        terminalReason: undefined,
        endedAt: undefined,
        observedActionCount: 3,
      },
      "action-started",
    );

    expect(renderMessage({ pending: true }, active)).not.toContain(
      "chat-turn-activity-summary",
    );
    expect(renderMessage({ pending: false }, active)).not.toContain(
      "chat-turn-activity-summary",
    );
  });

  it("does not label user messages or turns without receipt evidence", () => {
    expect(
      renderMessage({ role: "user" }, receipt({ observedActionCount: 2 })),
    ).not.toContain("chat-turn-activity-summary");
    expect(renderMessage()).not.toContain("chat-turn-activity-summary");
  });
});
