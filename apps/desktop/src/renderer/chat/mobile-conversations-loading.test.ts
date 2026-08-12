import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../ChatPage.tsx", import.meta.url),
  "utf8",
);

describe("mobile conversations loading boundary", () => {
  it("keeps the dialog implementation out of ChatPage's eager graph", () => {
    expect(source).toContain('import("./chat/MobileConversationsDialog")');
    expect(source).not.toContain(
      'import { MobileConversationsDialog } from "./chat/MobileConversationsDialog"',
    );
  });

  it("keeps modal semantics and the focus ref present while loading", () => {
    expect(source).toContain("MobileConversationsDialogFallback");
    expect(source).toContain('aria-label="Conversations"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('role="dialog"');
    expect(source).toContain("dialogRef={mobileConversationsDialogRef}");
    expect(source).toContain("Loading conversations…");
    expect(source).toContain("data-mobile-conversation");
    expect(source).toContain("chat-mobile-conversations-dismiss");
    expect(source).toContain(
      "onClose={() => setMobileConversationsOpen(false)}",
    );
  });
});
