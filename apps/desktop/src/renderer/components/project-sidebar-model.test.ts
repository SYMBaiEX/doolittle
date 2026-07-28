import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../shared/contracts";
import type { ProjectLike } from "./ProjectManager";
import {
  buildProjectSidebarModel,
  conversationLabel,
  repositoryLabel,
} from "./project-sidebar-model";

const session = (
  sessionId: string,
  projectId: string | undefined,
  endedAt: string,
): SessionSummary => ({
  sessionId,
  projectId,
  messageCount: 2,
  endedAt,
  participants: ["user", "assistant"],
  preview: [sessionId],
});

describe("buildProjectSidebarModel", () => {
  it("groups chats by active repository and keeps pinned projects first", () => {
    const projects: ProjectLike[] = [
      {
        id: "recent",
        name: "Recent",
        primaryPath: "/work/recent",
      },
      {
        id: "pinned",
        name: "Pinned",
        pinned: true,
        primaryPath: "/work/pinned",
      },
      { id: "archived", name: "Archived", archived: true },
    ];
    const sessions = [
      session("recent-chat", "recent", "2026-07-27T15:00:00.000Z"),
      session("pinned-chat", "pinned", "2026-07-26T15:00:00.000Z"),
      session("general-chat", undefined, "2026-07-25T15:00:00.000Z"),
      session("archived-chat", "archived", "2026-07-24T15:00:00.000Z"),
    ];

    const model = buildProjectSidebarModel(projects, sessions);

    expect(model.projects.map((group) => group.project.id)).toEqual([
      "pinned",
      "recent",
    ]);
    expect(model.projects[1]?.sessions[0]?.sessionId).toBe("recent-chat");
    expect(model.unscopedSessions[0]?.sessionId).toBe("general-chat");
    expect(model.unscopedChatCount).toBe(1);
  });

  it("limits previews without losing the total chat count", () => {
    const project: ProjectLike = { id: "repo", name: "Repo" };
    const sessions = [
      session("third", "repo", "2026-07-25T15:00:00.000Z"),
      session("first", "repo", "2026-07-27T15:00:00.000Z"),
      session("second", "repo", "2026-07-26T15:00:00.000Z"),
    ];

    const [group] = buildProjectSidebarModel([project], sessions, 2).projects;

    expect(group?.sessions.map((entry) => entry.sessionId)).toEqual([
      "first",
      "second",
    ]);
    expect(group?.chatCount).toBe(3);
  });

  it("keeps pinned conversations visible ahead of newer activity", () => {
    const project: ProjectLike = { id: "repo", name: "Repo" };
    const sessions = [
      session("newest", "repo", "2026-07-27T15:00:00.000Z"),
      session("pinned", "repo", "2026-07-20T15:00:00.000Z"),
      session("middle", "repo", "2026-07-26T15:00:00.000Z"),
    ];

    const [group] = buildProjectSidebarModel(
      [project],
      sessions,
      2,
      new Set(["pinned"]),
    ).projects;

    expect(group?.sessions.map((entry) => entry.sessionId)).toEqual([
      "pinned",
      "newest",
    ]);
  });
});

describe("repositoryLabel", () => {
  it("supports POSIX and Windows repository paths", () => {
    expect(repositoryLabel("/Users/me/code/doolittle")).toBe("doolittle");
    expect(repositoryLabel("C:\\code\\doolittle")).toBe("doolittle");
    expect(repositoryLabel(undefined)).toBe("Repository");
  });
});

describe("conversationLabel", () => {
  it("removes transport role prefixes from visible chat titles", () => {
    expect(
      conversationLabel({
        ...session("chat", "repo", "2026-07-27T15:00:00.000Z"),
        title: "[user] What is this repo?",
      }),
    ).toBe("What is this repo?");
  });
});
