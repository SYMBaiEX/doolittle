import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./app-polish.css", import.meta.url), "utf8");
const legacyChromeCss = [
  readFileSync(new URL("./styles.css", import.meta.url), "utf8"),
  readFileSync(new URL("./experience.css", import.meta.url), "utf8"),
  css,
].join("\n");
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
    expect(legacyChromeCss).not.toMatch(/\.chat-header(?![-\w])(?=[^{}]*\{)/);
    expect(legacyChromeCss).not.toMatch(
      /\.chat-header-toolbar(?![-\w])(?=[^{}]*\{)/,
    );
  });

  it("combines desktop workspace and conversation controls into one 44px row", () => {
    expect(app).toMatch(
      /className="window-dragbar-primary"[\s\S]*?className="window-context"[\s\S]*?className="chat-chrome-host"[\s\S]*?className="window-tools"/,
    );
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
    expect(css).toMatch(
      /\.app-main--chat > \.window-dragbar--chat\s*{[^}]*display:\s*flex;[^}]*flex:\s*0 0 44px;[^}]*min-height:\s*44px;/s,
    );
    expect(css).toMatch(
      /\.window-dragbar--chat \.window-dragbar-primary\s*{[^}]*min-width:\s*0;[^}]*min-height:\s*44px;/s,
    );
    expect(css).toMatch(
      /\.chat-chrome-host\s*{[^}]*min-width:\s*0;[^}]*flex:\s*1 1 420px;/s,
    );
    expect(css).toMatch(
      /\.chat-header-mainline\s*{[^}]*grid-template-columns:\s*minmax\(132px,\s*0\.7fr\)\s*minmax\(0,\s*1fr\)\s*auto;[^}]*grid-template-rows:\s*44px;/s,
    );
    expect(css).toMatch(
      /\.chat-header-top-actions\s*{[^}]*-webkit-app-region:\s*no-drag;/s,
    );
    expect(css).toMatch(
      /\.chat-model-route\s*{[^}]*align-self:\s*center;[^}]*align-items:\s*center;[^}]*line-height:\s*1;/s,
    );
    expect(css).toMatch(
      /\.chat-session-meta\s*{[^}]*-webkit-app-region:\s*no-drag;/s,
    );
  });

  it("progressively hides secondary controls and only falls back to two rows on mobile", () => {
    expect(css).toMatch(
      /@media \(max-width: 1420px\)\s*{[^}]*\.chat-meta-updated,[^}]*\.chat-meta-workspace\s*{[^}]*display:\s*none;/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 1180px\)\s*{[^}]*\.chat-session-meta-wrap\s*{[^}]*display:\s*none;/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.window-dragbar--chat \.window-dragbar-primary\s*{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*34px 34px;[\s\S]*?\.app-main--chat > \.window-dragbar--chat\s*{[^}]*flex-basis:\s*68px;[^}]*min-height:\s*68px;/,
    );
    expect(css).toMatch(
      /\.chat-context-compact\s*{[^}]*white-space:\s*nowrap;/s,
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
