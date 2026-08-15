// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ActivityCenter, type ActivityCenterEvent } from "./ActivityCenter";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function events(): ActivityCenterEvent[] {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `event-${index}`,
    kind: index === 0 ? "approval" : "chat-run",
    occurredAt: `2026-08-15T0${index}:00:00.000Z`,
    safeSummary: `Recorded event ${index}`,
    sourceId: `source-${index}`,
    status: index === 0 ? "pending" : "succeeded",
    target: index === 0 ? "review" : "chat",
    title: `Event ${index}`,
  }));
}

describe("ActivityCenter", () => {
  it("keeps attention, expansion, and target actions accessible", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onOpenTarget = vi.fn();

    act(() => {
      root.render(
        <ActivityCenter
          active
          error=""
          events={events()}
          loading={false}
          onOpenTarget={onOpenTarget}
          reload={vi.fn()}
        />,
      );
    });

    expect(host.querySelectorAll("ol li")).toHaveLength(5);
    const expand = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("more"),
    );
    act(() => expand?.click());
    expect(host.querySelectorAll("ol li")).toHaveLength(6);
    expect(host.querySelector('[data-needs-attention="true"]')).not.toBeNull();

    const review = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Open review",
    );
    act(() => review?.click());
    expect(onOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event-0" }),
    );

    act(() => root.unmount());
    host.remove();
  });
});
