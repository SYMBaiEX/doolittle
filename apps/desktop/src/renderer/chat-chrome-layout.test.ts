import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./app-polish.css", import.meta.url), "utf8");

describe("chat chrome density contract", () => {
  it("keeps desktop chat chrome to two equal rows totaling 56px", () => {
    expect(css).toMatch(
      /\.app-main--chat > \.window-dragbar--chat\s*{[^}]*flex:\s*0 0 56px;[^}]*min-height:\s*56px;/s,
    );
    expect(css).toMatch(
      /\.window-dragbar--chat \.window-dragbar-primary\s*{[^}]*flex:\s*0 0 28px;[^}]*min-height:\s*28px;/s,
    );
    expect(css).toMatch(
      /\.chat-chrome-host\s*{[^}]*flex:\s*0 0 28px;[^}]*min-height:\s*28px;/s,
    );
    expect(css).toMatch(
      /\.chat-header-mainline\s*{[^}]*grid-template-rows:\s*28px;/s,
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
      /@media \(max-width: 760px\)[\s\S]*?\.app-main--chat > \.window-dragbar--chat\s*{[^}]*flex-basis:\s*62px;[^}]*min-height:\s*62px;/,
    );
  });
});
