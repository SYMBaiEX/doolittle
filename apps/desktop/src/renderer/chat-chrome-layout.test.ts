import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CHAT_CHROME_HOST_CLASS,
  WINDOW_DRAGBAR_CHAT_CLASS,
  WINDOW_DRAGBAR_PRIMARY_CLASS,
} from "./app-shell/shell-layout";
import { CHAT_HEADER_CONTENT_CLASS, CHAT_WORKSPACE_CLASS } from "./chat/layout";
import { MESSAGE_RESPONSE_CLASS } from "./components/message-content-layout";
import {
  COMPOSER_MODEL_TRIGGER_CLASS,
  COMPOSER_PROJECT_TRIGGER_CLASS,
} from "./composer-selectors/layout";

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
  it("closes the same-render double-submit window synchronously", () => {
    const guard = "Object.keys(requestSession.current).length > 0";
    expect(chatPage).toContain(guard);
    expect(chatPage.indexOf(guard)).toBeLessThan(
      chatPage.indexOf("requestSession.current[requestId] = sessionId"),
    );
  });

  it("does not retain unreachable legacy chat shell selectors", () => {
    expect(CHAT_HEADER_CONTENT_CLASS).not.toContain("chat-header-toolbar");
  });

  it("combines desktop workspace and conversation controls into one 40px row", () => {
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
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain("basis-10");
    expect(WINDOW_DRAGBAR_PRIMARY_CLASS).toContain("min-h-10");
    expect(CHAT_CHROME_HOST_CLASS).toContain("min-w-0");
    expect(CHAT_CHROME_HOST_CLASS).toContain("flex-[1_1_420px]");
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "grid-cols-[minmax(132px,0.7fr)_minmax(0,1fr)_auto]",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain("grid-rows-[40px]");
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
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain(
      "max-[760px]:basis-[calc(var(--control-height)+40px+var(--space-2))]",
    );
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain(
      "max-[760px]:[&_.window-dragbar-primary]:grid-rows-[var(--control-height)_40px]",
    );
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain(
      "max-[480px]:[&_.window-dragbar-primary]:grid-rows-[40px_40px]",
    );
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain(
      "max-[480px]:[.desktop-shell.platform-darwin_&]:pt-9",
    );
    expect(app).toMatch(/platform-\$\{window\.doolittle\.platform\}/);
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "max-[480px]:[&_.chat-model-route]:hidden",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "max-[480px]:[&_.chat-header-top-actions]:grid",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain(
      "max-[480px]:[&_.secondary-button]:min-h-10",
    );
    expect(CHAT_HEADER_CONTENT_CLASS).toContain("whitespace-nowrap");
  });

  it("keeps the narrow composer to two compact bands", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-composer]:grid-cols-[auto_minmax(0,1fr)_auto]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-composer-routing]:!order-20",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-context-meter]:!hidden",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-composer-control-label]:hidden",
    );
    expect(COMPOSER_PROJECT_TRIGGER_CLASS).toContain("max-[480px]:w-10");
    expect(COMPOSER_MODEL_TRIGGER_CLASS).toContain("max-[480px]:h-10");
  });

  it("uses compact transcript typography and bounded code blocks", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-messages]:px-2",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-message.user_.chat-message-body]:py-2",
    );
    expect(MESSAGE_RESPONSE_CLASS).toContain("[&_p]:!my-[0.48em]");
    expect(MESSAGE_RESPONSE_CLASS).toContain("!max-h-[280px]");
    expect(MESSAGE_RESPONSE_CLASS).toContain(
      "max-[480px]:[&_[data-streamdown=code-block-body]]:!max-h-[220px]",
    );
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
