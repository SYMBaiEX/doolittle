// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../shared/contracts";
import type { ProjectLike } from "../project-manager/models";
import { ProjectHistorySidebar } from "./ProjectHistorySidebar";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
const sessionTwo: SessionSummary = {
  ...session,
  endedAt: "2026-08-12T11:00:00.000Z",
  preview: ["Another thread"],
  sessionId: "session-2",
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

  it("keeps the project quietly active while only the current chat is selected", () => {
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
          sessions={[session, sessionTwo]}
        />,
      ),
    );

    const disclosure = container.querySelector<HTMLButtonElement>(
      ".project-rail-disclosure",
    );
    expect(disclosure?.className).toContain("size-5.5");
    expect(disclosure?.className).not.toContain("w-4.25");
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");
    act(() => disclosure?.click());
    expect(disclosure?.getAttribute("aria-expanded")).toBe("false");
    act(() => disclosure?.click());
    const chats = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".project-rail-chat"),
    );
    const selectedChat = chats.find(
      (chat) => chat.getAttribute("aria-current") === "true",
    );
    const unselectedChat = chats.find(
      (chat) => chat.getAttribute("aria-current") !== "true",
    );
    act(() => selectedChat?.click());
    expect(onOpenSession).toHaveBeenCalledWith("session-1");
    expect(selectedChat?.className).toContain("is-selected");
    expect(unselectedChat?.className).not.toContain("is-selected");
    const group = container.querySelector(".project-rail-group");
    const projectRow = container.querySelector(".project-rail-row");
    const projectMain =
      container.querySelector<HTMLButtonElement>(".project-rail-main");
    expect(group?.className).toContain("is-active");
    expect(group?.className).not.toContain("before:bg-[var(--accent)]");
    expect(projectRow?.className).toContain("surface-hover)_46%");
    expect(projectRow?.className).toContain("inset_2px_0_0");
    expect(projectMain?.getAttribute("aria-current")).toBe("page");
    expect(projectMain?.getAttribute("aria-label")).toBe("Repo chats");
    expect(projectMain?.getAttribute("title")).toBe("Repo · /work/repo");
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
    const chatRow = container.querySelector(".project-rail-chat-row");
    const newChat =
      container.querySelector<HTMLButtonElement>(".project-rail-new");
    expect(pin?.className).toContain("size-5.5");
    expect(chatRow?.className).toContain("grid-cols-[minmax(0,1fr)_22px]");
    expect(newChat?.className).toContain("size-5.5");
    expect(newChat?.className).toContain(
      "group-focus-within/project-row:opacity-100",
    );
    expect(pin?.className).toContain("group-focus-within/chat:opacity-100");
    expect(pin?.getAttribute("aria-pressed")).toBe("false");
    act(() => pin?.click());
    expect(pin?.getAttribute("aria-pressed")).toBe("true");
  });

  it("labels and selects General chats when navigation is collapsed", () => {
    const onSelectScope = vi.fn();
    act(() =>
      root.render(
        <div className="desktop-shell nav-collapsed">
          <ProjectHistorySidebar
            activeScope="all"
            onChooseRepository={vi.fn()}
            onManageProjects={vi.fn()}
            onOpenSession={vi.fn()}
            onSelectScope={onSelectScope}
            onStartConversation={vi.fn()}
            onViewAll={vi.fn()}
            projects={[project]}
            selectedSessionId=""
            sessions={[{ ...session, projectId: undefined }]}
          />
        </div>,
      ),
    );

    const general = container.querySelector<HTMLButtonElement>(
      ".project-rail-group--general .project-rail-main",
    );
    expect(general?.getAttribute("aria-label")).toBe("General chats");
    expect(general?.getAttribute("aria-current")).toBeNull();
    expect(general?.getAttribute("title")).toBe(
      "General chats (no repository)",
    );
    expect(
      general
        ?.querySelector(".project-rail-general-mark")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    act(() => general?.click());
    expect(onSelectScope).toHaveBeenCalledWith("unscoped");
  });

  it("keeps collapsed project buttons labeled even when text is hidden", () => {
    act(() =>
      root.render(
        <div className="desktop-shell nav-collapsed">
          <ProjectHistorySidebar
            activeScope="repo"
            onChooseRepository={vi.fn()}
            onManageProjects={vi.fn()}
            onOpenSession={vi.fn()}
            onSelectScope={vi.fn()}
            onStartConversation={vi.fn()}
            onViewAll={vi.fn()}
            projects={[project]}
            selectedSessionId="session-1"
            sessions={[session]}
          />
        </div>,
      ),
    );

    const projectButton = container.querySelector<HTMLButtonElement>(
      ".project-rail-group .project-rail-main",
    );
    expect(projectButton?.getAttribute("aria-label")).toBe("Repo chats");
    expect(projectButton?.getAttribute("aria-current")).toBe("page");
    expect(projectButton?.getAttribute("title")).toBe("Repo · /work/repo");
  });
});
