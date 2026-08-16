import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DesktopRouteContent,
  type DesktopRouteContentProps,
} from "./app-shell/DesktopRouteContent";
import type { ApiResource } from "./lib";

function createRouteProps(
  approvalsResource: ApiResource<{ approvals?: unknown[] }>,
): DesktopRouteContentProps {
  return {
    activeProject: null,
    approvalsResource,
    backend: { phase: "ready", message: "Ready" },
    chatChromeHost: null,
    navigation: {
      chooseRepositoryForConversation: vi.fn(),
      consumeNavigationIntent: vi.fn(),
      createConversation: vi.fn(),
      openChatWithContext: vi.fn(),
      openProjectManager: vi.fn(),
      openSession: vi.fn(),
      selectSession: vi.fn(),
      setView: vi.fn(),
      transitionToProjectScope: vi.fn(),
    },
    onChooseWorkspace: vi.fn(),
    onConsumeContextHandoff: vi.fn(),
    onOpenWorkspacePath: vi.fn(),
    pendingApprovals: 0,
    pendingContextHandoff: null,
    pendingNavigationIntent: null,
    projectCards: [],
    projectLabels: {},
    projectScope: "all",
    refreshRuntime: vi.fn().mockResolvedValue(true),
    routeFocus: new Map(),
    runtime: null,
    runningTasks: 0,
    scopedSessions: [],
    selectedSession: "session-1",
    view: "dashboard",
    workspacePath: "/work/doolittle",
  };
}

describe("dashboard approval resource wiring", () => {
  it("passes the shell-owned approval resource to the dashboard route", () => {
    const approvalsResource: ApiResource<{ approvals?: unknown[] }> = {
      data: { approvals: [{ id: "approval-1" }] },
      error: "",
      loading: false,
      reload: vi.fn(),
    };

    const route = DesktopRouteContent(createRouteProps(approvalsResource));

    expect(isValidElement(route)).toBe(true);
    if (!isValidElement<{ children: unknown }>(route))
      throw new Error("Expected the route contract wrapper.");
    const dashboard = route.props.children;
    if (
      !isValidElement<{ approvalsResource: typeof approvalsResource }>(
        dashboard,
      )
    ) {
      throw new Error("Expected the dashboard route element.");
    }
    expect(dashboard.props.approvalsResource).toBe(approvalsResource);
  });
});
