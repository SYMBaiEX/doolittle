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
    expect(host.innerHTML).not.toContain("gradient(");
    expect(host.innerHTML).not.toContain("shadow-[0_0_8px");
    expect(
      host.querySelector('[data-needs-attention="true"] span')?.className,
    ).toContain("shadow-[0_0_0_3px");

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

  it("keeps loading and unavailable recovery truthful and disabled while inactive", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const reload = vi.fn();
    act(() =>
      root.render(
        <ActivityCenter
          active
          error=""
          events={[]}
          loading
          onOpenTarget={vi.fn()}
          reload={reload}
        />,
      ),
    );
    expect(host.textContent).toContain("Loading recent activity…");
    expect(host.textContent).not.toContain("No recent activity.");
    expect(host.querySelector("section")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    expect(host.querySelector("button")?.disabled).toBe(true);
    act(() =>
      root.render(
        <ActivityCenter
          active={false}
          error="Offline"
          events={[]}
          loading={false}
          onOpenTarget={vi.fn()}
          reload={reload}
        />,
      ),
    );
    expect(host.textContent).toContain("Activity is unavailable: Offline");
    const retry = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    );
    expect(retry?.disabled).toBe(true);
    for (const button of host.querySelectorAll("button")) {
      expect(button.className).toContain("min-h-[var(--control-height)]");
      expect(button.className).toContain("max-[760px]:min-h-11");
      expect(button.className).toContain(
        "focus-visible:outline-[var(--focus-ring)]",
      );
    }
    act(() => root.unmount());
  });
});
