import { describe, expect, it } from "vitest";
import { chatDispatchBlockReason } from "./dispatch-readiness";

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
