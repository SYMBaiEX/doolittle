import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  CHAT_CHROME_HOST_CLASS,
  VIEW_CONTAINER_CLASS,
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
  it("keeps even short chat screens bounded instead of scrolling the route", async () => {
    const compiler = await compile("@tailwind utilities;");
    const candidates = VIEW_CONTAINER_CLASS.split(/\s+/u).filter((candidate) =>
      candidate.includes("view-chat"),
    );
    const css = compiler.build(candidates);
    expect(css).toContain(".view-chat {");
    expect(css).toContain("overflow: hidden !important");
    expect(css).not.toContain("height: auto");
    expect(css).not.toContain("overflow: visible");
    expect(css).not.toContain("grid-template-rows: 128px auto");
    expect(css).not.toContain("display: none");
    expect(css).not.toContain("view-code");
    expect(VIEW_CONTAINER_CLASS).toContain("min-h-0 min-w-0 flex-1");
  });
  it("closes the same-render double-submit window synchronously", () => {
    expect(chatPage).toContain("activeRequestSessionsRef");
    expect(chatPage).toContain(
      "activeRequestSessionsRef.current[sessionId] = true;",
    );
    const guard = "activeRequestSessionsRef.current[sessionId] ||";
    expect(chatPage).toContain(guard);
    expect(chatPage.indexOf(guard)).toBeLessThan(
      chatPage.indexOf("requestSession.current[requestId] = sessionId"),
    );
  });

  it("cleans up the chat event bridge during StrictMode effect replays", () => {
    expect(chatPage).toContain(
      "const unsubscribe = window.doolittle.onChatEvent(handleChatEvent);",
    );
    expect(chatPage).toContain("return unsubscribe;");
  });

  it("does not retain unreachable legacy chat shell selectors", () => {
    expect(CHAT_HEADER_CONTENT_CLASS).not.toContain("chat-header-toolbar");
  });

  it("keeps identity and conversation controls in one 48px shell row", () => {
    expect(app).toContain("WINDOW_DRAGBAR_PRIMARY_CLASS");
    expect(app).toContain("WINDOW_CONTEXT_CLASS");
    expect(app).toContain("CHAT_CHROME_HOST_CLASS");
    expect(app).toContain("WINDOW_TOOLS_CLASS");
    expect(chatPage).toContain("createPortal(");
    expect(chatPage).not.toContain('className="chat-header"');
    expect(app).toMatch(
      /renderedView === "chat"\s*\? \(selectedBot\?\.name \?\? "Doolittle"\)/u,
    );
    expect(app).toContain("currentRouteLabel");
    expect(chatHeader).not.toContain("Conversation breadcrumb");
    expect(chatHeader).not.toContain('aria-label="Find conversation"');
    expect(chatHeader).toContain('aria-label="Conversation options"');
    expect(chatHeader).toContain("doolittle:new-conversation-view");
    expect(chatPage).toMatch(/id=\{`chat-context-history-\$\{selectedId\}`\}/);
    expect(chatPage).toMatch(/id=\{`chat-context-media-\$\{selectedId\}`\}/);
    expect(chatPage).toContain('hidden={surface !== "conversation"}');
    expect(chatPage).toContain('inert={surface !== "history"}');
    expect(chatPage).toContain('inert={surface !== "media"}');
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain("basis-12");
    expect(WINDOW_DRAGBAR_PRIMARY_CLASS).toContain("min-h-12");
    expect(CHAT_CHROME_HOST_CLASS).toContain("min-w-0");
    expect(CHAT_CHROME_HOST_CLASS).toContain("[-webkit-app-region:no-drag]");
  });

  it("keeps the same header geometry at intermediate widths", () => {
    expect(app).toContain("currentRouteLabel");
    expect(app).toContain("compactCommand={false}");
    expect(WINDOW_DRAGBAR_CHAT_CLASS).toContain("h-12 basis-12");
    expect(WINDOW_DRAGBAR_CHAT_CLASS).not.toContain("grid-rows-[40px_40px]");
    expect(app).toMatch(/platform-\$\{window\.doolittle\.platform\}/);
    expect(chatHeader).toContain("max-[760px]:size-11");
  });

  it("compiles one chat header row with independently truncating identity", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const shellCss = compiler.build(WINDOW_DRAGBAR_CHAT_CLASS.split(/\s+/u));
    expect(shellCss).toContain("height: calc(var(--spacing) * 12)");
    expect(shellCss).not.toContain("grid-row-start: 2");
    expect(app).toContain("min-w-0 items-baseline gap-2");
    expect(app).toContain("truncate text-sm");
  });

  it("compiles two pane-local composer bands with readable 44px targets", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(
      CHAT_WORKSPACE_CLASS.split(/\s+/u).filter((candidate) =>
        candidate.startsWith("@max-[640px]/session:"),
      ),
    );
    expect(css).toContain("@container session (width < 640px)");
    expect(css).toContain("grid-template-columns: repeat(1, minmax(0, 1fr))");
    expect(css).toContain("min-height: calc(var(--spacing) * 11) !important");
    expect(css).toContain("min-width: calc(var(--spacing) * 11) !important");
    expect(css).toContain(".chat-composer-meta-toggle > span");
    expect(css).toContain("display: none !important");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-composer-footer]:grid");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-composer-footer-right]:flex",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-composer-details]:border-t",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-composer]:pt-[5px]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-composer]:pb-[4px]",
    );
    expect(CHAT_WORKSPACE_CLASS).not.toContain(
      "max-[480px]:[&_.chat-composer-meta-toggle]:!size-10",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "@max-[640px]/session:[&_.chat-composer-status]:!inline-flex",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "@max-[640px]/session:[&_.chat-composer-meta-toggle>span]:!hidden",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-context-meter]:!hidden",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-composer-control-label]:hidden",
    );
    expect(COMPOSER_PROJECT_TRIGGER_CLASS).toContain("max-[480px]:w-11");
    expect(COMPOSER_MODEL_TRIGGER_CLASS).toContain("max-[480px]:h-11");
  });

  it("uses compact transcript typography and bounded code blocks", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "max-[480px]:[&_.chat-messages]:px-2",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-message.user_.chat-message-body]:py-1.75",
    );
    expect(MESSAGE_RESPONSE_CLASS).toContain("[&_p]:!my-[0.36em]");
    expect(MESSAGE_RESPONSE_CLASS).toContain("!max-h-[220px]");
    expect(MESSAGE_RESPONSE_CLASS).toContain(
      "max-[480px]:[&_[data-streamdown=code-block-body]]:!max-h-[180px]",
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
