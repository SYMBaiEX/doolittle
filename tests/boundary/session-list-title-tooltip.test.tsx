// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionListPanel } from "../../apps/desktop/src/renderer/sessions/SessionListPanel";
import type { SessionSummary } from "../../apps/desktop/src/shared/contracts";

const LONG_TITLE =
  "Audit markdown gauntlet with a distinguishing suffix that truncates away";

function session(sessionId: string, title = sessionId): SessionSummary {
  return {
    sessionId,
    title,
    participants: [],
    messageCount: 3,
    preview: [],
    endedAt: "2026-11-25T19:04:00.000Z",
  };
}

describe("session list row full-title access", () => {
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
    document.body.innerHTML = "";
  });

  function renderPanel(sessions: SessionSummary[]) {
    act(() =>
      root.render(
        <SessionListPanel
          active
          onSelect={vi.fn()}
          sessions={sessions}
          selectedId=""
        />,
      ),
    );
  }

  it("exposes the full untruncated title on keyboard focus", async () => {
    renderPanel([session("chat-long", LONG_TITLE)]);
    const row = host.querySelector<HTMLButtonElement>(
      "[data-session-row='true']",
    );
    if (!row) throw new Error("Missing session row.");
    // The visible label is truncated by layout; the full title only lives in
    // the tooltip until focus or hover asks for it.
    expect(document.querySelector("[role='tooltip']")).toBeNull();

    await act(async () => {
      row.focus();
      row.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
      // Radix opens after the provider delay; wait past it with real timers.
      await new Promise((resolve) => setTimeout(resolve, 700));
    });
    const tooltip = document.querySelector("[role='tooltip']");
    expect(tooltip?.textContent).toContain(LONG_TITLE);
    expect(tooltip?.textContent).toContain("3 messages");
  }, 10_000);
});
