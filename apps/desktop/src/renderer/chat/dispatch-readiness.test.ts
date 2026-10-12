import { describe, expect, it } from "vitest";
import {
  botAcceptsDispatch,
  CANCELLATION_UNCONFIRMED_MESSAGE,
  chatDispatchBlockReason,
  retainCancellationFailureFeedback,
} from "./dispatch-readiness";

const ready = {
  hasContent: true,
  sessionId: "second",
  workspaceKind: "unbound",
  alreadyClaimed: false,
  ownerResolved: true,
  ownerReady: true,
  backendReady: true,
  hydration: "ready",
} as const;
describe("chat dispatch feedback", () => {
  it("keeps an unconfirmed cancellation visible without releasing a claimed turn", () => {
    const prior = { another: "Separate session feedback" };
    const feedback = retainCancellationFailureFeedback(prior, "second");
    expect(feedback).toEqual({
      another: "Separate session feedback",
      second: CANCELLATION_UNCONFIRMED_MESSAGE,
    });
    expect(retainCancellationFailureFeedback(feedback, "second")).toBe(
      feedback,
    );
    expect(
      chatDispatchBlockReason({ ...ready, alreadyClaimed: true }),
    ).toContain("already starting or running");
  });
  it("permits only an idle saved named bot to start on its first request", () => {
    expect(
      botAcceptsDispatch(
        { isDefault: false, state: "stopped" },
        "jerry",
        "lead",
      ),
    ).toBe(true);
    expect(
      botAcceptsDispatch({ isDefault: false, state: "ready" }, "jerry", "lead"),
    ).toBe(true);
    for (const state of ["starting", "error", "archived"] as const) {
      expect(
        botAcceptsDispatch({ isDefault: false, state }, "jerry", "lead"),
      ).toBe(false);
    }
    expect(
      botAcceptsDispatch({ isDefault: true, state: "stopped" }, "lead", "lead"),
    ).toBe(false);
    expect(botAcceptsDispatch(undefined, "missing", "lead")).toBe(false);
  });
  it("rejects a second first-send while the cold bot's original request is claimed", () => {
    const coldBot = { isDefault: false, state: "stopped" } as const;
    const ownerReady = botAcceptsDispatch(coldBot, "jerry", "lead");
    expect(chatDispatchBlockReason({ ...ready, ownerReady })).toBeUndefined();
    expect(
      chatDispatchBlockReason({ ...ready, ownerReady, alreadyClaimed: true }),
    ).toContain("already starting or running");
    expect(
      chatDispatchBlockReason({
        ...ready,
        ownerReady: botAcceptsDispatch(
          { isDefault: false, state: "error" },
          "jerry",
          "lead",
        ),
      }),
    ).toContain("not ready");
  });
  it("admits another owned conversation without borrowing an unrelated run's state", () => {
    expect(chatDispatchBlockReason(ready)).toBeUndefined();
    expect(
      chatDispatchBlockReason({ ...ready, alreadyClaimed: true }),
    ).toContain("already starting or running");
  });
  it("makes ownership, workspace, worker and hydration rejection actionable", () => {
    expect(
      chatDispatchBlockReason({ ...ready, ownerResolved: false }),
    ).toContain("owner is still unavailable");
    expect(
      chatDispatchBlockReason({ ...ready, workspaceKind: "foreign" }),
    ).toContain("project before sending");
    expect(
      chatDispatchBlockReason({ ...ready, workspaceKind: "unknown" }),
    ).toContain("project could not be resolved");
    expect(chatDispatchBlockReason({ ...ready, ownerReady: false })).toContain(
      "bot is not ready",
    );
    expect(
      chatDispatchBlockReason({ ...ready, backendReady: false }),
    ).toContain("bot is not ready");
    expect(
      chatDispatchBlockReason({ ...ready, hydration: "checking" }),
    ).toContain("run list");
    expect(
      chatDispatchBlockReason({ ...ready, hydration: "unavailable" }),
    ).toContain("run list");
  });
});
