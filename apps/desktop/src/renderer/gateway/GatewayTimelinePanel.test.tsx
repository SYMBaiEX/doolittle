import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GatewayTimelinePanel } from "./GatewayTimelinePanel";

const entries = [
  {
    id: "inbox-1",
    direction: "inbox" as const,
    at: "2026-08-12T12:00:00.000Z",
    platform: "discord",
    status: "accepted",
    sessionId: "discord:room:alex",
    roomId: "room",
    threadId: "",
    author: "Alex",
    preview: "Please investigate this.",
    attachmentCount: 0,
  },
  {
    id: "outbox-1",
    direction: "outbox" as const,
    at: "2026-08-12T12:01:00.000Z",
    platform: "discord",
    status: "sent",
    sessionId: "discord:room:alex",
    roomId: "room",
    threadId: "",
    author: "",
    preview: "I am on it.",
    attachmentCount: 0,
  },
];

describe("GatewayTimelinePanel", () => {
  it("keeps routine gateway records compact and defers replay confirmation", () => {
    const markup = renderToStaticMarkup(
      <GatewayTimelinePanel
        direction="all"
        entries={entries}
        loading={false}
        onDirectionChange={vi.fn()}
        onPlatformChange={vi.fn()}
        onQueryChange={vi.fn()}
        onReplay={vi.fn()}
        platform="all"
        platforms={["discord"]}
        query=""
        replayingId=""
        visibleEntries={entries}
      />,
    );

    expect(markup).toContain("Please investigate this.");
    expect(markup).toContain("I am on it.");
    expect(markup).toContain(">Replay</button>");
    expect(markup).toContain('aria-label="Replay inbound Discord message"');
    expect(markup.match(/>Replay<\/button>/g)).toHaveLength(1);
    expect(markup).not.toContain("Replay this inbound message?");
    expect(markup).not.toContain("Replay this recorded inbound message.");
  });
});
