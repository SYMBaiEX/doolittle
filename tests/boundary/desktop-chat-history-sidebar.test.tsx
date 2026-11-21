// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatHistorySidebar } from "../../apps/desktop/src/renderer/app-shell/ChatHistorySidebar";
import { useConversationPins } from "../../apps/desktop/src/renderer/chat/useConversationPins";
import {
  loadConversationPins,
  saveConversationPins,
} from "../../apps/desktop/src/renderer/conversation-persistence";
import { ChatWorkspaceProvider } from "../../apps/desktop/src/renderer/session-workspace/chat-workspace-store";
import type { SessionSummary } from "../../apps/desktop/src/shared/contracts";

function conversation(
  sessionId: string,
  fields?: Partial<SessionSummary>,
): SessionSummary {
  return {
    sessionId,
    title: sessionId,
    participants: [],
    messageCount: 0,
    preview: [],
    ...fields,
  };
}

function section(host: HTMLElement, title: string): HTMLElement {
  const result = host.querySelector<HTMLElement>(
    `section[aria-label="${title}"]`,
  );
  if (!result) throw new Error(`Missing ${title} section`);
  return result;
}

function button(host: HTMLElement, title: string): HTMLButtonElement {
  const result = Array.from(host.querySelectorAll("button")).find(
    (element) =>
      (element.getAttribute("aria-label") ?? element.textContent) === title,
  );
  if (!result) throw new Error(`Missing ${title} button`);
  return result;
}

function HeaderPin({ sessionId }: { sessionId: string }) {
  const { pinnedSessions, togglePin } = useConversationPins();
  return (
    <button
      aria-pressed={pinnedSessions[sessionId] === true}
      onClick={() => togglePin(sessionId)}
      type="button"
    >
      Pin from header
    </button>
  );
}

describe("desktop chat history sections", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  let host: HTMLElement;

  beforeEach(() => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });

  it("groups histories by pin, project affiliation, and age, and keeps disclosure state", () => {
    const recentDate = new Date().toISOString();
    const sessions = [
      conversation("Project chat", {
        projectId: "project",
        endedAt: recentDate,
      }),
      conversation("Newer direct chat", { endedAt: recentDate }),
      conversation("Older direct chat", { endedAt: "2001-01-01T00:00:00Z" }),
      conversation("Duplicate project chat", { sessionId: "Project chat" }),
      conversation("Pinned project chat", { projectId: "project" }),
      conversation("Known archived chat", { projectId: "archived" }),
      conversation("Legacy project chat", {
        projectId: "legacy",
        projectContext: { name: "Legacy notebook" },
      }),
    ];
    const projects = [
      { id: "project", name: "Doolittle" },
      { id: "archived", name: "Old work", archivedAt: recentDate },
    ];
    const open = vi.fn();
    saveConversationPins(localStorage, { "Pinned project chat": true });

    const renderer = createRoot(host);
    const draw = (mountKey = "first") =>
      act(() =>
        renderer.render(
          <ChatHistorySidebar
            key={mountKey}
            filtered={false}
            onOpenSession={open}
            projects={projects}
            selectedSession="Project chat"
            sessions={sessions}
            showingGroups={false}
          />,
        ),
      );
    try {
      draw();
      expect(section(host, "Pinned").textContent).toContain(
        "Pinned project chat",
      );
      expect(section(host, "Projects").textContent).not.toContain(
        "Pinned project chat",
      );
      expect(section(host, "Projects").textContent).toContain(
        "Legacy notebook",
      );
      expect(section(host, "Projects").textContent).toContain("Archived");
      expect(host.textContent).not.toContain("Duplicate project chat");
      expect(section(host, "Recent").textContent).toContain(
        "Newer direct chat",
      );
      expect(section(host, "General").textContent).toContain(
        "Older direct chat",
      );

      const current = button(host, "Project chat");
      expect(current.getAttribute("aria-current")).toBe("page");
      act(() => current.click());
      expect(open).toHaveBeenCalledExactlyOnceWith("Project chat");

      act(() => button(host, "Doolittle").click());
      expect(button(host, "Doolittle").getAttribute("aria-expanded")).toBe(
        "false",
      );
      expect(section(host, "Projects").textContent).not.toContain(
        "Project chat",
      );
      act(() => button(host, "General").click());
      draw("reopened");
      expect(button(host, "Doolittle").getAttribute("aria-expanded")).toBe(
        "false",
      );
      expect(button(host, "General").getAttribute("aria-expanded")).toBe(
        "false",
      );
      act(() => button(host, "Doolittle").click());
      expect(section(host, "Projects").textContent).toContain("Project chat");
    } finally {
      act(() => renderer.unmount());
    }
  });

  it("shares pins with the conversation header and persists opaque group chat IDs", () => {
    const sessionId = `connector:${"account%20".repeat(27)}`;
    const sessions = [
      conversation(sessionId, {
        title: "Saved group",
        conversationKind: "group",
      }),
    ];
    const renderer = createRoot(host);
    try {
      act(() =>
        renderer.render(
          <ChatWorkspaceProvider>
            <HeaderPin sessionId={sessionId} />
            <ChatHistorySidebar
              filtered={false}
              onOpenSession={vi.fn()}
              projects={[]}
              sessions={sessions}
              showingGroups
            />
          </ChatWorkspaceProvider>,
        ),
      );
      const header = button(host, "Pin from header");
      expect(section(host, "General").textContent).toContain("Saved group");

      act(() => header.click());
      expect(header.getAttribute("aria-pressed")).toBe("true");
      expect(section(host, "Pinned").textContent).toContain("Saved group");
      expect(section(host, "General").textContent).not.toContain("Saved group");
      expect(loadConversationPins(localStorage)[sessionId]).toBe(true);

      act(() => header.click());
      expect(header.getAttribute("aria-pressed")).toBe("false");
      expect(section(host, "Pinned").textContent).not.toContain("Saved group");
      expect(section(host, "General").textContent).toContain("Saved group");
      expect(loadConversationPins(localStorage)[sessionId]).toBeUndefined();
    } finally {
      act(() => renderer.unmount());
    }
  });
});
