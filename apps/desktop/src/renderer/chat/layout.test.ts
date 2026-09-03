import { describe, expect, it } from "vitest";
import { CHAT_WORKSPACE_CLASS } from "./layout";

describe("chat layout", () => {
  it("anchors the jump control within the conversation column", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain("motion-reduce:transition-none");
    expect(CHAT_WORKSPACE_CLASS).toContain("motion-reduce:duration-0");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-conversation]:relative");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-jump-to-latest]:bottom-[88px]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-composer-main]:grid");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-composer-footer]:grid");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-composer-footer-right]:flex",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-composer-details]:border-t",
    );
  });
});
