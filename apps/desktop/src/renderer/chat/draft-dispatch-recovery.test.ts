import { describe, expect, it } from "vitest";
import type { ConversationDraft } from "../conversation-persistence";
import {
  canRestoreRejectedDispatch,
  snapshotDraftForDispatch,
} from "./draft-dispatch-recovery";

const draft: ConversationDraft = {
  text: "Explain the failing test",
  attachments: [
    {
      id: "123e4567-e89b-42d3-a456-426614174000",
      name: "failure.txt",
      kind: "document",
      mimeType: "text/plain",
      sizeBytes: 10,
      sha256: "a".repeat(64),
    },
  ],
  capsule: {
    kind: "terminal",
    path: "Terminal",
    content: "<terminal_context>exit 1</terminal_context>",
  },
};

describe("draft dispatch recovery", () => {
  it("snapshots the full hidden capsule and attachment payload", () => {
    const recovery = snapshotDraftForDispatch("chat-1", draft, 4);

    expect(recovery).toEqual({
      sessionId: "chat-1",
      revision: 4,
      draft,
    });
    expect(recovery.draft).not.toBe(draft);
    expect(recovery.draft.attachments).not.toBe(draft.attachments);
    expect(recovery.draft.capsule).not.toBe(draft.capsule);
  });

  it("only permits restoration while the cleared composer revision is current", () => {
    const recovery = snapshotDraftForDispatch("chat-1", draft, 4);

    expect(canRestoreRejectedDispatch(recovery, 4)).toBe(true);
    expect(canRestoreRejectedDispatch(recovery, 5)).toBe(false);
  });
});
