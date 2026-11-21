// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { DisplayMessage } from "../../apps/desktop/src/renderer/chat/models";
import type {
  SessionMessagesResponse,
  SessionSummary,
} from "../../apps/desktop/src/shared/contracts";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../apps/desktop/src/renderer/lib", () => ({
  desktopRequest: request,
}));

import { mergeConversationHistory } from "../../apps/desktop/src/renderer/chat/history-reconciliation";
import { RunClaims } from "../../apps/desktop/src/renderer/chat/run-claim-reconciliation";
import { useChatConversationState } from "../../apps/desktop/src/renderer/chat/useChatConversationState";

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 10, 21, 0, 0, seconds)).toISOString();

function row(
  id: string,
  role: DisplayMessage["role"],
  seconds: number,
  runId?: string,
): DisplayMessage {
  return {
    id,
    role,
    createdAt: at(seconds),
    content: role === "user" ? "Repeat this" : "Assistant reply",
    ...(runId ? { runId } : {}),
  };
}

function HistoryProbe({
  owner,
  session,
  runClaims,
  capture,
}: {
  owner: string;
  session: SessionSummary;
  runClaims: { current: RunClaims };
  capture(messages: DisplayMessage[]): void;
}) {
  const state = useChatConversationState({
    activeRequest: null,
    backendReady: true,
    botIdForSession: () => owner,
    onSelect: () => undefined,
    persistenceOwner: false,
    remoteSessions: [{ ...session }],
    runClaims,
    selectedId: session.sessionId,
  });
  capture(state.selectedMessages);
  return null;
}

it("retains exact anchors and uses each repeated history prompt only once", () => {
  const history = [
    row("canonical-1", "user", 0),
    row("reply-1", "assistant", 1),
    row("canonical-2", "user", 2),
    row("reply-2", "assistant", 3),
    row("canonical-3", "user", 4),
  ];
  // Reserve an exact anchor before trying the optimistic row, even if a
  // repeated prompt has an equally close timestamp.
  const local = [
    row("optimistic-1", "user", 3, "run-1"),
    { ...row("assistant:run-1", "assistant", 4), pending: true },
    row("canonical-3", "user", 4, "run-3"),
    { ...row("assistant:run-3", "assistant", 5), pending: true },
  ];
  expect(mergeConversationHistory(local, history, new Set(["run-3"]))).toEqual([
    history[0],
    history[1],
    { ...history[2], runId: "run-1" },
    { ...history[3], runId: "run-1" },
    { ...history[4], runId: "run-3" },
    local[3],
  ]);
});

it("does not restart history on a polling refresh with the same conversation version", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  request.mockReset();
  const signals: AbortSignal[] = [];
  const responses: Array<(value: SessionMessagesResponse) => void> = [];
  request.mockImplementation(
    (_path: string, _method: string, _body: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<SessionMessagesResponse>((resolve) => {
        responses.push(resolve);
      });
    },
  );
  const runClaims = { current: new RunClaims() };
  const session: SessionSummary = {
    sessionId: "saved",
    messageCount: 2,
    endedAt: at(3),
    participants: [],
    preview: [],
  };
  let selected: DisplayMessage[] | undefined;
  const container = document.createElement("div");
  const root = createRoot(container);
  function render(owner: string, messageCount: number) {
    root.render(
      createElement(HistoryProbe, {
        owner,
        session: { ...session, messageCount },
        runClaims,
        capture: (messages) => {
          selected = messages;
        },
      }),
    );
  }
  try {
    await act(async () => {
      render("initial", 2);
    });
    await act(async () => {
      render("initial", 2);
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(signals[0]?.aborted).toBe(false);

    await act(async () => {
      render("rebound", 3);
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    await act(async () => {
      responses[1]?.({
        messages: [
          {
            id: "right",
            role: "user",
            text: "New owner's chat",
            createdAt: at(5),
          },
        ],
      } as SessionMessagesResponse);
      responses[0]?.({
        messages: [
          { id: "wrong", role: "user", text: "Superseded", createdAt: at(4) },
        ],
      } as SessionMessagesResponse);
    });
    expect(selected?.map((message) => message.id)).toEqual(["right"]);
  } finally {
    await act(async () => root.unmount());
  }
});
