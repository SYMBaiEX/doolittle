// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "../../apps/desktop/src/shared/contracts";

vi.mock("../../apps/desktop/src/renderer/eliza-client", () => ({
  desktopRequest: vi.fn(async (path: string) => {
    if (path.startsWith("/sessions/messages")) {
      return {
        messages: [],
        totalMessages: 6,
      };
    }
    if (path.startsWith("/sessions/continuity")) {
      return { entries: [] };
    }
    if (path.startsWith("/sessions/usage")) {
      return { totals: {} };
    }
    throw new Error(`Unexpected request: ${path}`);
  }),
}));

const { SessionDetail } = await import(
  "../../apps/desktop/src/renderer/sessions/SessionDetail"
);

function session(messageCount: number): SessionSummary {
  return {
    sessionId: "chat-audit",
    title: "Audit conversation",
    participants: [],
    messageCount,
    preview: [],
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return false;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
  }
  return true;
}

describe("session detail count reconciliation", () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previousAct = environment.IS_REACT_ACT_ENVIRONMENT;
  let host: HTMLElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    const { desktopQueryClient } = await import(
      "../../apps/desktop/src/renderer/lib"
    );
    desktopQueryClient.clear();
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

  it("reconciles a stale inventory row when the live transcript total differs", async () => {
    const observed = vi.fn();
    await act(async () => {
      root.render(
        <SessionDetail
          active
          onExport={vi.fn()}
          onOpenChat={vi.fn()}
          onRefresh={vi.fn()}
          onSelectSession={vi.fn()}
          onSessionMessageCountObserved={observed}
          selected={session(4)}
          transferring={false}
        />,
      );
    });
    // Row said 4 (stale snapshot); the transcript read the live total 6 —
    // the inventory row must be reconciled so both surfaces agree.
    await waitFor(() => observed.mock.calls.length > 0);
    expect(observed).toHaveBeenCalledWith("chat-audit", 6);
  });

  it("does not fire when the row already matches the live total", async () => {
    const observed = vi.fn();
    await act(async () => {
      root.render(
        <SessionDetail
          active
          onExport={vi.fn()}
          onOpenChat={vi.fn()}
          onRefresh={vi.fn()}
          onSelectSession={vi.fn()}
          onSessionMessageCountObserved={observed}
          selected={session(6)}
          transferring={false}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(observed).not.toHaveBeenCalled();
  });
});
