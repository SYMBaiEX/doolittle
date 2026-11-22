// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DashboardPriorityPanel } from "../../apps/desktop/src/renderer/dashboard/DashboardPriorityPanel";
import { HomeObservabilityLinks } from "../../apps/desktop/src/renderer/dashboard/HomeObservabilityLinks";
import { RuntimeLogStream } from "../../apps/desktop/src/renderer/logs/RuntimeLogStream";

const reactEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
const noop = () => {};
let previousActEnvironment: boolean | undefined;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  previousActEnvironment = reactEnvironment.IS_REACT_ACT_ENVIRONMENT;
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  reactEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
});

it("opens the active conversation from a described dashboard action", () => {
  const openChat = vi.fn();
  act(() => {
    root.render(
      <DashboardPriorityPanel
        agentAccounts={0}
        conversations="1"
        nextActions={[
          {
            description: "Continue where you left off.",
            id: "continue",
            target: "chat",
            title: "Continue conversation",
            tone: "neutral",
          },
          {
            description: "Resolve open approvals.",
            id: "review",
            target: "review",
            title: "Review approvals",
            tone: "warn",
          },
        ]}
        onOpenChat={openChat}
        repo={{
          ahead: 0,
          behind: 0,
          branch: "main",
          changedFiles: 0,
          dirty: false,
          lines: [],
        }}
        repoError=""
        repoLoading={false}
        reloadRepo={noop}
        reloadSetup={noop}
        runtimePlugins="0"
        sessions={[
          {
            id: "session-1",
            title: "First chat",
            preview: "Draft",
            messageCount: 1,
            lastActivityLabel: "Today",
          },
        ]}
        setupEntries={[]}
        setupError=""
        setupLoading={false}
        setupWarnings={0}
      />,
    );
  });

  const action = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Open Continue conversation"]',
  );
  const review = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Open Review approvals"]',
  );
  const descriptionId = action?.getAttribute("aria-describedby");
  expect(
    descriptionId && document.getElementById(descriptionId)?.textContent,
  ).toBe("Continue where you left off.");
  expect(review?.disabled).toBe(true);
  act(() => action?.click());
  expect(openChat).toHaveBeenCalledExactlyOnceWith("session-1");
});

it("presents Activity and Insights as native navigation links", () => {
  act(() => root.render(<HomeObservabilityLinks />));

  const links = container.querySelectorAll<HTMLAnchorElement>(
    'nav[aria-label="Observability"] a',
  );
  expect(
    [...links].map((link) => [
      link.getAttribute("aria-label"),
      link.getAttribute("href"),
    ]),
  ).toEqual([
    ["Open activity", "#/home/activity"],
    ["Open insights", "#/home/insights"],
  ]);
});

it("keeps logs keyboard reachable and focuses the requested event", () => {
  let onFrame: FrameRequestCallback | undefined;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    onFrame = callback;
    return 1;
  });
  const timestamp = "2026-11-21T18:00:00Z";
  act(() => {
    root.render(
      <RuntimeLogStream
        entries={[
          { id: "startup", level: "info", message: "API listening" },
          { id: "plugin", level: "warn", message: "Plugin delayed", timestamp },
        ]}
        filtered={false}
        focusedLogId="plugin"
        focusRequestId="search-1"
        loading={false}
        onRetry={noop}
      />,
    );
  });

  const records = container.querySelector<HTMLElement>('[role="log"]');
  const target = records?.querySelector<HTMLElement>("[data-search-target]");
  if (!records || !target)
    throw new Error("Expected the log and search target.");
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", { value: scrollIntoView });
  records.focus();
  expect(document.activeElement).toBe(records);
  expect(records.tabIndex).toBe(0);
  expect(target.querySelector("time")?.dateTime).toBe(timestamp);
  act(() => onFrame?.(0));
  expect(document.activeElement).toBe(target);
  expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ block: "center" });
});
