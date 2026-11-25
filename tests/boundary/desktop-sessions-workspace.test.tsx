// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsPage } from "../../apps/desktop/src/renderer/sessions/SessionsPage";
import {
  SESSIONS_EMPTY_WORKSPACE_CLASS,
  SESSIONS_WORKSPACE_CLASS,
} from "../../apps/desktop/src/renderer/sessions/sessions-layout";
import type { SessionSummary } from "../../apps/desktop/src/shared/contracts";

function session(sessionId: string): SessionSummary {
  return {
    sessionId,
    title: sessionId,
    participants: [],
    messageCount: 0,
    preview: [],
  };
}

describe("sessions workspace layout", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  let host: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });

  function renderPage(sessions: SessionSummary[]): HTMLElement {
    act(() =>
      root.render(
        <SessionsPage
          active
          onNewConversation={vi.fn()}
          openChat={vi.fn()}
          refresh={vi.fn()}
          sessions={sessions}
        />,
      ),
    );
    const page = host.querySelector<HTMLElement>("[data-sessions-page]");
    if (!page) throw new Error("Missing sessions page.");
    return page;
  }

  it("owns the split layout without the shared split-workspace chrome", () => {
    renderPage([session("chat-1")]);
    const workspace =
      host.querySelector<HTMLElement>(".list-panel")?.parentElement;
    if (!workspace) throw new Error("Missing sessions workspace.");
    expect(workspace.className).toBe(SESSIONS_WORKSPACE_CLASS);
    expect(workspace.className).toContain("grid-cols-[clamp(250px,24vw,320px)");
    expect(host.querySelector(".split-workspace")).toBeNull();
  });

  it("keeps the empty landing on a single chromeless column", () => {
    renderPage([]);
    const landing = host.querySelector<HTMLElement>(
      "[data-session-empty-landing]",
    );
    const workspace = landing?.parentElement;
    if (!workspace) throw new Error("Missing sessions empty workspace.");
    expect(workspace.className).toBe(SESSIONS_EMPTY_WORKSPACE_CLASS);
    expect(host.querySelector(".split-workspace")).toBeNull();
  });
});
