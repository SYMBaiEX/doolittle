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
    retryable: false,
    retryCompleted: false,
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
    retryable: false,
    retryCompleted: false,
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
        onRetryDelivery={vi.fn()}
        platform="all"
        platforms={["discord"]}
        query=""
        replayingId=""
        retryingDeliveryId=""
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
        onRetryDelivery={vi.fn()}
        platform="all"
        platforms={[]}
        query=""
        replayingId=""
        retryingDeliveryId=""
        visibleEntries={[]}
      />,
    );

    expect(markup).toContain("Waiting for gateway traffic");
    expect(markup).toContain("0 records");
    expect(markup).toContain('class="gateway-history-state is-empty"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('class="empty-block');
    expect(markup).not.toContain("Gateway record filters");
    expect(markup).not.toContain("Find record");
  });

  it("uses the same compact rail while local history is loading", () => {
    const markup = renderToStaticMarkup(
      <GatewayTimelinePanel
        direction="all"
        entries={[]}
        loading
        onDirectionChange={vi.fn()}
        onPlatformChange={vi.fn()}
        onQueryChange={vi.fn()}
        onReplay={vi.fn()}
        onRetryDelivery={vi.fn()}
        platform="all"
        platforms={[]}
        query=""
        replayingId=""
        retryingDeliveryId=""
        visibleEntries={[]}
      />,
    );

    expect(markup).toContain("Reading message history");
    expect(markup).toContain('class="gateway-history-state is-loading"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('class="loading-block');
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
        onRetryDelivery={vi.fn()}
        platform="discord"
        platforms={["discord"]}
        query="missing"
        replayingId=""
        retryingDeliveryId=""
        visibleEntries={[]}
      />,
    );

    expect(markup).toContain("Gateway record filters");
    expect(markup).toContain("No records match these filters");
  });

  it("offers a guarded retry only for rejected outbound delivery", () => {
    const rejected = {
      ...entries[1],
      id: "outbox-rejected",
      status: "rejected",
      retryable: true,
    };
    const markup = renderToStaticMarkup(
      <GatewayTimelinePanel
        direction="all"
        entries={[rejected]}
        loading={false}
        onDirectionChange={vi.fn()}
        onPlatformChange={vi.fn()}
        onQueryChange={vi.fn()}
        onReplay={vi.fn()}
        onRetryDelivery={vi.fn()}
        platform="all"
        platforms={["discord"]}
        query=""
        replayingId=""
        retryingDeliveryId=""
        visibleEntries={[rejected]}
      />,
    );

    expect(markup).toContain("Retry delivery");
    expect(markup).toContain('aria-label="Retry rejected Discord delivery"');
    expect(markup).not.toContain("Replay inbound");
  });
});
