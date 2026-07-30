import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./app-polish.css", import.meta.url), "utf8");

describe("chat chrome density contract", () => {
  it("keeps desktop chat chrome to two rows totaling 58px with a single compact conversation row", () => {
    expect(css).toMatch(
      /\.app-main--chat > \.window-dragbar--chat\s*{[^}]*display:\s*grid;[^}]*flex:\s*0 0 58px;[^}]*grid-template-rows:\s*30px 28px;[^}]*min-height:\s*58px;/s,
    );
    expect(css).toMatch(
      /\.window-dragbar--chat \.window-dragbar-primary\s*{[^}]*min-height:\s*0;/s,
    );
    expect(css).toMatch(/\.chat-chrome-host\s*{[^}]*min-height:\s*0;/s);
    expect(css).toMatch(
      /\.chat-header-mainline\s*{[^}]*grid-template-columns:\s*minmax\(132px,\s*0\.52fr\)\s*minmax\(0,\s*1fr\)\s*auto;[^}]*grid-template-rows:\s*28px;/s,
    );
  });

  it("hides secondary metadata instead of creating another responsive row", () => {
    expect(css).toMatch(
      /@media \(max-width: 1180px\)\s*{[^}]*\.chat-meta-updated,[^}]*\.chat-meta-workspace\s*{[^}]*display:\s*none;/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 920px\)\s*{[^}]*\.chat-session-meta-wrap\s*{[^}]*display:\s*none;/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.app-main--chat > \.window-dragbar--chat\s*{[^}]*flex-basis:\s*68px;[^}]*grid-template-rows:\s*34px 34px;[^}]*min-height:\s*68px;/,
    );
    expect(css).toMatch(
      /\.chat-context-compact\s*{[^}]*white-space:\s*nowrap;/s,
    );
  });
});
