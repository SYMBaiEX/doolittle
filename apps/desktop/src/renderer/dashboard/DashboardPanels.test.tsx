// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardActivityPanels } from "./DashboardActivityPanels";
import { DashboardPriorityPanel } from "./DashboardPriorityPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("dashboard panels", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps recent-session and queue actions connected after extraction", () => {
    const openChat = vi.fn();
    const openReview = vi.fn();
    act(() =>
      root.render(
        <DashboardActivityPanels
          approvals={[]}
          approvalsError=""
          approvalsLoading={false}
          onOpenChat={openChat}
          onOpenReview={openReview}
          onOpenTasks={vi.fn()}
          reloadApprovals={vi.fn()}
          reloadTasks={vi.fn()}
          sessions={[
            {
              id: "session-1",
              lastActivityLabel: "2026-08-12T00:00:00Z",
              messageCount: 4,
              preview: "Inspect the workspace",
              title: "Workspace review",
            },
          ]}
          tasks={[]}
          tasksError=""
          tasksLoading={false}
        />,
      ),
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(".dashboard-session-button")
        ?.click(),
    );
    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Review")
        ?.click(),
    );

    expect(openChat).toHaveBeenCalledWith("session-1");
    expect(openReview).toHaveBeenCalledOnce();
  });

  it("routes the top provider action without losing workspace truth", () => {
    const openProviders = vi.fn();
    act(() =>
      root.render(
        <DashboardPriorityPanel
          agentAccounts={0}
          conversations="3"
          nextActions={[
            {
              description: "Connect an account.",
              id: "providers",
              target: "providers",
              title: "Connect accounts",
              tone: "warn",
            },
          ]}
          onOpenProviders={openProviders}
          reloadRepo={vi.fn()}
          reloadSetup={vi.fn()}
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
          runtimePlugins="12"
          sessions={[]}
          setupEntries={[]}
          setupError=""
          setupLoading={false}
          setupWarnings={0}
        />,
      ),
    );

    act(() =>
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Open")
        ?.click(),
    );

    expect(openProviders).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("main");
    expect(container.textContent).toContain("Clean");
  });
});
