// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useApiResourceMock } = vi.hoisted(() => ({
  useApiResourceMock: vi.fn(),
}));

vi.mock("./lib", async () => {
  const actual = await vi.importActual<typeof import("./lib")>("./lib");
  return { ...actual, useApiResource: useApiResourceMock };
});

import { ActivityPage } from "./ActivityPage";
import { AnalyticsPage } from "./analytics/AnalyticsPage";
import { LogsPage } from "./LogsPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function resource(data: unknown) {
  return { data, error: "", loading: false, reload: vi.fn() };
}

describe("observability route density", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    useApiResourceMock.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps Activity controls and audit context in a compact timeline", () => {
    useApiResourceMock.mockReturnValue(
      resource({
        events: [
          {
            id: "event-1",
            kind: "chat-run",
            occurredAt: "2026-08-12T10:00:00Z",
            safeSummary: "Chat run completed with 2 recorded actions.",
            status: "succeeded",
            target: "chat",
            title: "Chat run completed",
          },
        ],
      }),
    );

    act(() => root.render(<ActivityPage active />));

    expect(
      container.querySelectorAll(".compact-stat-strip__item"),
    ).toHaveLength(3);
    expect(container.querySelector("[data-activity-entry]")).not.toBeNull();
    expect(container.textContent).toContain("2 recorded actions");
    expect(container.textContent).toContain("Export JSON");
    expect(container.querySelector("#activity-source")).not.toBeNull();
  });

  it("does not repeat the selected log filter and defers trace requests", () => {
    const requestedPaths: Array<string | null> = [];
    useApiResourceMock.mockImplementation((path: string | null) => {
      requestedPaths.push(path);
      if (path?.startsWith("/logs?")) {
        return resource({
          logs: [
            {
              at: "2026-08-12T10:00:00Z",
              level: "warn",
              message: "Retrying",
              scope: "gateway",
            },
          ],
        });
      }
      if (path === "/deliveries") return resource({ deliveries: [] });
      if (path === "/terminal/history") return resource({ commands: [] });
      return resource(null);
    });

    act(() => root.render(<LogsPage active />));

    expect(
      container.querySelectorAll(".compact-stat-strip__item"),
    ).toHaveLength(3);
    expect(container.textContent).not.toContain("FilterAll");
    expect(container.querySelector("[data-runtime-log-stream]")).not.toBeNull();
    expect(container.textContent).toContain("gateway · Retrying");
    expect(requestedPaths).not.toContain("/deliveries");
    expect(requestedPaths).not.toContain("/terminal/history");

    const details = container.querySelector<HTMLDetailsElement>(
      "[data-operations-traces]",
    );
    act(() => {
      if (!details) return;
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
    });

    expect(requestedPaths).toContain("/deliveries");
    expect(requestedPaths).toContain("/terminal/history");
  });

  it("keeps Analytics local-truth labels while removing metric footnotes", () => {
    useApiResourceMock.mockReturnValue(
      resource({
        dailyActivity: [{ date: "2026-08-12", messages: 4 }],
        recentSessions: [],
        totals: {
          assistantMessages: 3,
          estimatedTokens: 900,
          messages: 4,
          sessions: 1,
          systemMessages: 0,
          userMessages: 1,
        },
      }),
    );

    act(() =>
      root.render(<AnalyticsPage active onNewConversation={vi.fn()} />),
    );

    expect(container.querySelector("[data-analytics-page]")).not.toBeNull();
    expect(
      container.querySelectorAll(".compact-stat-strip__item"),
    ).toHaveLength(4);
    expect(
      container.querySelectorAll(".compact-stat-strip__item small"),
    ).toHaveLength(0);
    expect(container.textContent).toContain("No remote telemetry");
  });

  it("collapses zero analytics into one actionable local-first landing", () => {
    const onNewConversation = vi.fn();
    useApiResourceMock.mockReturnValue(
      resource({
        dailyActivity: [],
        recentSessions: [],
        totals: {},
      }),
    );

    act(() =>
      root.render(
        <AnalyticsPage active onNewConversation={onNewConversation} />,
      ),
    );

    expect(container.querySelector("[data-analytics-empty]")).not.toBeNull();
    expect(container.querySelector(".compact-stat-strip")).toBeNull();
    expect(container.querySelector("[data-analytics-grid]")).toBeNull();
    const action = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Start conversation",
    );
    expect(action).not.toBeUndefined();
    act(() => action?.click());
    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });
});
