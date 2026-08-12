import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../shared/contracts";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));

vi.mock("../lib", async () => {
  const actual = await vi.importActual<typeof import("../lib")>("../lib");
  return {
    ...actual,
    useApiResource: useApiResourceMock,
  };
});

import { SessionDetail } from "./SessionDetail";

const selected: SessionSummary = {
  sessionId: "session-1",
  title: "Review the repo",
  participants: ["user", "assistant"],
  preview: ["Summarize the package layout and write the README."],
  startedAt: "2026-08-12T10:00:00.000Z",
  endedAt: "2026-08-12T10:30:00.000Z",
  messageCount: 6,
  parentSessionId: "session-0",
};

describe("SessionDetail layout", () => {
  it("keeps the transcript area compact without repeating session summary copy", () => {
    useApiResourceMock
      .mockReturnValueOnce({
        data: {
          messages: [
            {
              id: "message-1",
              sessionId: "session-1",
              roomId: "room-1",
              entityId: "entity-1",
              role: "assistant",
              text: "Repository summary",
              createdAt: "2026-08-12T10:30:00.000Z",
            },
          ],
        },
        error: "",
        loading: false,
        reload: vi.fn(),
      })
      .mockReturnValueOnce({
        data: {
          usage: {
            messageCount: 6,
            estimatedTokens: 301,
            characterCount: 1201,
            endedAt: "2026-08-12T10:30:00.000Z",
          },
        },
        error: "",
        loading: false,
        reload: vi.fn(),
      })
      .mockReturnValueOnce({
        data: { sessions: [] },
        error: "",
        loading: false,
        reload: vi.fn(),
      });

    const html = renderToStaticMarkup(
      <SessionDetail
        active
        onExport={vi.fn()}
        onOpenChat={vi.fn()}
        onRefresh={vi.fn()}
        onSelectSession={vi.fn()}
        selected={selected}
        transferring={false}
      />,
    );

    expect(html).toContain('class="session-detail-stack"');
    expect(html).toContain('class="session-transcript-panel__header"');
    expect(html).toContain(">Persisted messages<");
    expect(html).toContain(">1 message<");
    expect(html).not.toContain("Session highlights");
    expect(html).not.toContain("Branch conversation");
    expect(html).not.toContain("2 participants");
    expect(html).not.toContain(
      "Rendered from the saved transcript for this session.",
    );
  });
});
