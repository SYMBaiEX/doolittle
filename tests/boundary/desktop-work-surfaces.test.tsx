// @vitest-environment jsdom
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GatewayTimelinePanel } from "../../apps/desktop/src/renderer/gateway/GatewayTimelinePanel";
import type { GatewayTimelineItem } from "../../apps/desktop/src/renderer/gateway-page-model";
import type { ReviewItem } from "../../apps/desktop/src/renderer/review/models";
import { ReviewQueue } from "../../apps/desktop/src/renderer/review/ReviewQueue";

const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const noop = () => {};
let previousAct: boolean | undefined;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previousAct = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousAct;
});

function button(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (entry) =>
      (entry.getAttribute("aria-label") ?? entry.textContent) === label,
  );
}

const reviewItem: ReviewItem = {
  id: "change",
  kind: "changes",
  title: "summary.ts",
  description: "Updated the summary.",
  status: "staged",
  raw: {},
};

function QueueFixture() {
  const [query, setQuery] = useState("unrelated title");
  const search = useRef<HTMLInputElement>(null);
  return (
    <ReviewQueue
      filter="all"
      items={[reviewItem]}
      onFilterChange={noop}
      onQueryChange={setQuery}
      onSelect={noop}
      platform="darwin"
      query={query}
      searchRef={search}
      selectedId={reviewItem.id}
      visibleItems={query ? [] : [reviewItem]}
    />
  );
}

it("keeps a review item selected and returns focus after clearing a search", () => {
  act(() => root.render(<QueueFixture />));
  expect(host.textContent).toContain("No matching work");
  const clear = button("Clear review search");
  expect(clear).toBeDefined();
  act(() => {
    clear?.focus();
    clear?.click();
  });
  expect(document.activeElement).toBe(
    host.querySelector('input[type="search"]'),
  );
  expect(
    host.querySelector('button[aria-current="true"]')?.textContent,
  ).toContain("summary.ts");
});

it("waits for replay confirmation and returns focus after cancellation", () => {
  const replay = vi.fn();
  const entry: GatewayTimelineItem = {
    id: "message",
    direction: "inbox",
    at: "2026-11-21T12:00:00Z",
    platform: "discord",
    status: "recorded",
    sessionId: "session",
    roomId: "room",
    threadId: "",
    author: "",
    preview: "A stored message",
    attachmentCount: 0,
    retryable: false,
    retryCompleted: false,
  };
  act(() =>
    root.render(
      <GatewayTimelinePanel
        direction="all"
        entries={[entry]}
        loading={false}
        onDirectionChange={noop}
        onPlatformChange={noop}
        onQueryChange={noop}
        onReplay={replay}
        onRetryDelivery={noop}
        platform="all"
        platforms={["discord"]}
        query=""
        replayingId=""
        retryingDeliveryId=""
        visibleEntries={[entry]}
      />,
    ),
  );
  const opener = button("Replay inbound Discord message");
  expect(opener).toBeDefined();
  act(() => opener?.click());
  expect(replay).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(button("Cancel"));

  act(() => button("Cancel")?.click());
  expect(document.activeElement).toBe(opener);
  expect(replay).not.toHaveBeenCalled();

  act(() => opener?.click());
  act(() => button("Confirm replay")?.click());
  expect(replay).toHaveBeenCalledExactlyOnceWith(entry.id);
});
