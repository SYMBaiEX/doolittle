import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { CHAT_WORKSPACE_CLASS } from "./layout";

describe("chat layout", () => {
  it("compiles narrow desktop inspector replacement without changing mobile dialogs", async () => {
    expect(CHAT_WORKSPACE_CLASS).toContain("[container-name:workbench]");
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const candidates = CHAT_WORKSPACE_CLASS.split(/\s+/u).filter((candidate) =>
      candidate.includes("/workbench:"),
    );
    const css = compiler.build(candidates);
    expect(candidates).toHaveLength(12);
    expect(css).toContain("@media (width >= 721px)");
    expect(css).toContain("@container workbench (width < 720px)");
    expect(css).toContain(".inspector-open > .chat-conversation");
    expect(css).toContain("display: none !important");
    expect(css).toContain("grid-column-start: 1 !important");
    expect(css).toContain(".chat-workbench-pane > .thread-workbench");
    expect(css).toContain("width: 100% !important");
    expect(css).toContain("min-width: 0px !important");
    expect(css).not.toContain("position: fixed");
  });

  it("compiles BEM selectors with literal underscores rather than descendants", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const candidates = CHAT_WORKSPACE_CLASS.split(/\s+/u).filter((candidate) =>
      candidate.includes("\\_\\_"),
    );
    expect(candidates).toHaveLength(23);
    const css = compiler.build(candidates);
    for (const selector of [
      ".chat-message.user .message-content__response p",
      ".chat-message.user .message-content__response li",
      ".chat-file-context-chip__icon",
      ".chat-file-context-chip__name",
      ".chat-file-context-chip__remove",
      ".chat-context-capsule__label",
      ".chat-context-capsule__remove",
      ".chat-memory-matches__kind",
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).toContain("white-space: pre-wrap");
    expect(css).not.toContain(".chat-file-context-chip remove");
    expect(css).not.toContain(".message-content response");
  });

  it("compiles the narrow context-label rule to its real child span", async () => {
    const compiler = await compile("@tailwind utilities;");
    const candidates = CHAT_WORKSPACE_CLASS.split(/\s+/u).filter((candidate) =>
      candidate.includes("chat-composer-meta-toggle>span"),
    );
    expect(candidates).toHaveLength(1);
    const css = compiler.build(candidates);
    expect(css).toContain("@container session (width < 640px)");
    expect(css).toContain(".chat-composer-meta-toggle > span");
    expect(css).toContain("display: none !important");
    expect(css).not.toContain(".chat-composer-meta-toggle label");
  });

  it("adapts the composer to session width without hiding run feedback", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-conversation]:[container-type:size]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-conversation]:[container-name:session]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "@max-[640px]/session:[&_.chat-composer-footer]:!grid-cols-1",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "@max-[640px]/session:[&_.chat-composer-submit]:!min-h-11",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "@max-[640px]/session:[&_.chat-composer-status]:!inline-flex",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "@max-[640px]/session:[&_.chat-composer-meta-toggle>span]:!hidden",
    );
  });

  it("anchors the jump control above the composer in the transcript region", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain("motion-reduce:transition-none");
    expect(CHAT_WORKSPACE_CLASS).toContain("motion-reduce:duration-0");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-conversation]:relative");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-jump-to-latest]:bottom-3");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-composer-main]:grid");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-composer-footer]:grid");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-composer-footer-right]:flex",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-composer-details]:border-t",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-progress]:border-l-[var(--accent)]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "motion-reduce:[&_.thinking]:before:animate-none",
    );
  });

  it("compiles separate stable transcript and composer rows for both chat states", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(
      CHAT_WORKSPACE_CLASS.split(/\s+/u).filter(
        (candidate) =>
          candidate.includes("chat-transcript-region") ||
          candidate.includes("chat-composer-dock") ||
          candidate === "[&_.chat-conversation]:!grid" ||
          candidate.includes("grid-rows-[minmax(0,1fr)"),
      ),
    );
    expect(css).toContain(".chat-transcript-region");
    expect(css).toContain("grid-row-start: 1");
    expect(css).toContain(".chat-composer-dock");
    expect(css).toContain("grid-row-start: 2");
    expect(css).toContain("display: grid !important");
    expect(css).toContain("grid-template-rows: minmax(0,1fr) auto");
    expect(css).toContain(".chat-conversation[data-layout=empty]");
    expect(css).toContain(
      "grid-template-rows: minmax(0,1fr) auto minmax(0,1fr)",
    );
    expect(css).toContain("max-height: max(96px, calc(100cqh - 128px))");
    expect(css).toContain("overflow-y: auto");
    expect(css).not.toContain("height: auto");
    expect(CHAT_WORKSPACE_CLASS).not.toContain(
      "chat-composer:has(textarea:focus-visible)",
    );
  });

  it("compiles pane-local short-screen selector and library sheets outside the dock", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(
      CHAT_WORKSPACE_CLASS.split(/\s+/u).filter((candidate) =>
        candidate.includes(
          ":is(.composer-selector-popover,.chat-prompt-library)",
        ),
      ),
    );
    expect(css).toContain("@media (max-height:640px)");
    expect(css).toContain(
      ".chat-composer :is(.composer-selector-popover, .chat-prompt-library)",
    );
    expect(css).toContain("position: fixed !important");
    expect(css).toContain("inset: calc(var(--spacing) * 3) !important");
    expect(css).toContain("width: auto !important");
    expect(css).toContain("max-height: none !important");
    expect(css).toContain("overflow-y: auto !important");
  });
});
