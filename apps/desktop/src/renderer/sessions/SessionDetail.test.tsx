import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StoredMessage } from "../../shared/contracts";
import { SessionTranscriptMessage } from "./SessionDetail";

const message = (overrides: Partial<StoredMessage> = {}): StoredMessage => ({
  id: "message-1",
  sessionId: "session-1",
  roomId: "room-1",
  entityId: "entity-1",
  role: "assistant",
  text: "**Repository summary**\n\n- `src/` contains the app",
  createdAt: "2026-08-12T12:00:00.000Z",
  ...overrides,
});

describe("SessionTranscriptMessage", () => {
  it("renders persisted Markdown through the shared safe chat renderer", () => {
    const html = renderToStaticMarkup(
      <SessionTranscriptMessage message={message()} />,
    );

    expect(html).toContain('data-streamdown="strong">Repository summary');
    expect(html).toContain('data-streamdown="inline-code">src/</code>');
    expect(html).not.toContain("**Repository summary**");
    expect(html).toContain('data-message-content="true"');
  });

  it("labels user transcript rows without parsing agent activity", () => {
    const html = renderToStaticMarkup(
      <SessionTranscriptMessage
        message={message({ role: "user", text: "Write the **README**" })}
      />,
    );

    expect(html).toContain("<strong>You</strong>");
    expect(html).toContain('data-streamdown="strong">README');
    expect(html).toContain('data-message-role="user"');
  });
});
