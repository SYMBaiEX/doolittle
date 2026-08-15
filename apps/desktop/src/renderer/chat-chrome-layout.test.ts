import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAT_CHROME_HOST_CLASS,
  WINDOW_DRAGBAR_CHAT_CLASS,
  WINDOW_DRAGBAR_PRIMARY_CLASS,
} from "./app-shell/shell-layout";
import { CHAT_HEADER_CONTENT_CLASS } from "./chat/layout";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const chatPage = readFileSync(
  new URL("./ChatPage.tsx", import.meta.url),
  "utf8",
);
const chatHeader = readFileSync(
  new URL("./chat/ChatHeaderChrome.tsx", import.meta.url),
  "utf8",
);

describe("chat chrome density contract", () => {
  it("does not retain unreachable legacy chat shell selectors", () => {
    expect(CHAT_HEADER_CONTENT_CLASS).not.toContain("chat-header-toolbar");
  });

  it("combines desktop workspace and conversation controls into one 44px row", () => {
    expect(app).toContain("WINDOW_DRAGBAR_PRIMARY_CLASS");
    expect(app).toContain("WINDOW_CONTEXT_CLASS");
    expect(app).toContain("CHAT_CHROME_HOST_CLASS");
    expect(app).toContain("WINDOW_TOOLS_CLASS");
    expect(chatPage).toContain("createPortal(");
    expect(chatPage).not.toContain('className="chat-header"');
    expect(chatHeader).toMatch(
      /className="chat-session-meta"[\s\S]*?chat-meta-count[\s\S]*?chat-meta-workspace[\s\S]*?chat-meta-updated/,
    );
    expect(chatHeader).toMatch(
      /className="chat-model-route"[\s\S]*?onOpenRouteControls/,
    );
    expect(chatHeader).toMatch(
      /chat-mobile-conversations-button[\s\S]*?History[\s\S]*?chat-workbench-toggle[\s\S]*?Workbench/,
    );
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain("basis-11");
    expect(WINDOW_DRAGBAR_PRIMARY_CLASS).toContain("min-h-11");
    expect(CHAT_CHROME_HOST_CLASS).toContain("min-w-0");
    expect(CHAT_CHROME_HOST_CLASS).toContain("flex-[1_1_420px]");
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "grid-cols-[minmax(132px,0.7fr)_minmax(0,1fr)_auto]",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain("grid-rows-[44px]");
    expect(CHAT_HEADER_CONTENT_CLASS).toContain("[-webkit-app-region:no-drag]");
  });

  it("progressively hides secondary controls and only falls back to two rows on mobile", () => {
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "max-[1440px]:[&_.chat-session-meta-wrap]:hidden",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "max-[980px]:[&_.chat-header-title-wrap]:hidden",
    );
    expect(app).toContain('compactCommand={view === "chat"}');
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain("max-[760px]:basis-17");
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain(
      "max-[760px]:[&_.window-dragbar-primary]:grid-rows-[34px_34px]",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain("whitespace-nowrap");
  });

  it("passes durable context handoffs into the lazy Chat surface instead of timing a window event", () => {
    expect(app).toContain("pendingContextHandoff={pendingChatContext}");
    expect(app).toContain("onConsumeContextHandoff={consumeChatContext}");
    expect(app).not.toContain("doolittle:insert-chat-context");
    expect(chatPage).toContain(
      "pendingContextHandoff.sessionId !== selectedId",
    );
    expect(chatPage).toContain("consumedContextHandoffs.current");
  });
});
