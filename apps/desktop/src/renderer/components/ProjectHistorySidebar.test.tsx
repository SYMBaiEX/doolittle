// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../shared/contracts";
import type { ProjectLike } from "../project-manager/models";
import { ProjectHistorySidebar } from "./ProjectHistorySidebar";

const project: ProjectLike = {
  id: "repo",
  name: "Repo",
  primaryPath: "/work/repo",
};
const session: SessionSummary = {
  endedAt: "2026-08-12T10:00:00.000Z",
  messageCount: 2,
  participants: ["user"],
  preview: ["Recent work"],
  projectId: "repo",
  sessionId: "session-1",
};

describe("ProjectHistorySidebar", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("preserves project expansion and session selection actions", () => {
    const onOpenSession = vi.fn();
    const onSelectScope = vi.fn();
    act(() =>
      root.render(
        <ProjectHistorySidebar
          activeScope="repo"
          onChooseRepository={vi.fn()}
          onManageProjects={vi.fn()}
          onOpenSession={onOpenSession}
          onSelectScope={onSelectScope}
          onStartConversation={vi.fn()}
          onViewAll={vi.fn()}
          projects={[project]}
          selectedSessionId="session-1"
          sessions={[session]}
        />,
      ),
    );

    const disclosure = container.querySelector<HTMLButtonElement>(
      ".project-rail-disclosure",
    );
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    act(() => disclosure?.click());
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    act(() => disclosure?.click());
    const chat = container.querySelector<HTMLButtonElement>(
      ".project-rail-chat:not(.project-rail-chat-pin)",
    );
    act(() => chat?.click());
    expect(onOpenSession).toHaveBeenCalledWith("session-1");
    expect(chat?.className).toContain("is-selected");
    const group = container.querySelector(".project-rail-group");
    const projectRow = container.querySelector(".project-rail-row");
    expect(group?.className).toContain("is-active");
    expect(group?.className).not.toContain("surface-hover)_76%");
    expect(projectRow?.className).toContain("surface-hover)_76%");
  });

  it("persists pin actions and exposes pressed state", () => {
    act(() =>
      root.render(
        <ProjectHistorySidebar
          activeScope="repo"
          onChooseRepository={vi.fn()}
          onManageProjects={vi.fn()}
          onOpenSession={vi.fn()}
          onSelectScope={vi.fn()}
          onStartConversation={vi.fn()}
          onViewAll={vi.fn()}
          projects={[project]}
          selectedSessionId=""
          sessions={[session]}
        />,
      ),
    );
    const pin = container.querySelector<HTMLButtonElement>(
      ".project-rail-chat-pin",
    );
    expect(pin?.getAttribute("aria-pressed")).toBe("false");
    act(() => pin?.click());
    expect(pin?.getAttribute("aria-pressed")).toBe("true");
  });
});
