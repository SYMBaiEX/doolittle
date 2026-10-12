// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DoolittleDesktopBridge } from "../shared/contracts";
import { useProjectManagement } from "./use-project-management";

describe("composer repository ownership", () => {
  it("retains the originating pane across an asynchronous repository picker", async () => {
    let finishPick:
      | ((result: { canceled: boolean; paths: string[] }) => void)
      | undefined;
    const pickProjectFolders = vi.fn(
      () =>
        new Promise<{ canceled: boolean; paths: string[] }>((resolve) => {
          finishPick = resolve;
        }),
    );
    const originalBridge = window.doolittle;
    window.doolittle = {
      pickProjectFolders,
    } as unknown as DoolittleDesktopBridge;
    const startChatInProject = vi.fn(async () => undefined);
    const switchToRecentWorkspace = vi.fn(async () => true);
    const container = document.createElement("div");
    const root = createRoot(container);
    let actions: ReturnType<typeof useProjectManagement> | undefined;
    const previousAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    function Probe() {
      actions = useProjectManagement({
        createSessionId: () => "new-chat",
        pathsEqual: (left, right) => left === right,
        projectScope: "all",
        projects: [
          {
            id: "project-B",
            name: "B",
            primaryPath: "/project/B",
            pinned: false,
            resources: [],
            createdAt: "",
            updatedAt: "",
          },
        ],
        pushToast: vi.fn(() => "toast"),
        selectProjectScope: vi.fn(),
        selectedSession: "globally-focused-A",
        startChatInProject,
        setProjectScope: vi.fn(),
        setProjects: vi.fn(),
        setSelectedSession: vi.fn(),
        setSessions: vi.fn(),
        setView: vi.fn(),
        setWorkspace: vi.fn(),
        switchToRecentWorkspace,
        transitionToProjectScope: vi.fn(),
        workspace: { currentPath: "/project/A", recentPaths: [] },
      });
      return null;
    }
    try {
      await act(async () => root.render(createElement(Probe)));
      if (!actions) throw new Error("Hook did not mount");
      const pending = actions.chooseRepositoryForConversation("pane-B-chat");
      expect(startChatInProject).not.toHaveBeenCalled();
      finishPick?.({ canceled: false, paths: ["/project/B"] });
      await act(async () => pending);
      expect(startChatInProject).toHaveBeenCalledExactlyOnceWith(
        "project-B",
        "pane-B-chat",
      );
      expect(switchToRecentWorkspace).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      window.doolittle = originalBridge;
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = previousAct;
    }
  });
});
