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
    expect(markup).toContain("Message history");
    expect(markup).toContain("2 of 2");
    expect(markup).not.toContain("Recorded timeline");
    expect(markup).toContain(">Replay</button>");
    expect(markup).toContain('aria-label="Replay inbound Discord message"');
    expect(markup.match(/>Replay<\/button>/g)).toHaveLength(1);
    expect(markup).not.toContain("Replay this inbound message?");
    expect(markup).not.toContain("Replay this recorded inbound message.");
  });

  it("omits inert filters until gateway history exists", () => {
    const markup = renderToStaticMarkup(
      <GatewayTimelinePanel
        direction="all"
        entries={[]}
        loading={false}
        onDirectionChange={vi.fn()}
        onPlatformChange={vi.fn()}
        onQueryChange={vi.fn()}
        onReplay={vi.fn()}
        platform="all"
        platforms={[]}
        query=""
        replayingId=""
        visibleEntries={[]}
      />,
    );

    expect(markup).toContain("No gateway messages recorded yet");
    expect(markup).not.toContain("Gateway record filters");
    expect(markup).not.toContain("Find record");
  });

  it("retains filters when existing records have no current match", () => {
    const markup = renderToStaticMarkup(
      <GatewayTimelinePanel
        direction="inbox"
        entries={entries}
        loading={false}
        onDirectionChange={vi.fn()}
        onPlatformChange={vi.fn()}
        onQueryChange={vi.fn()}
        onReplay={vi.fn()}
        platform="discord"
        platforms={["discord"]}
        query="missing"
        replayingId=""
        visibleEntries={[]}
      />,
    );

    expect(markup).toContain("Gateway record filters");
    expect(markup).toContain("No records match these filters");
  });
});
