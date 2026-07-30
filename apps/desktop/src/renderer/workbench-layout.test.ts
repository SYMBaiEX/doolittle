import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const chatPage = readFileSync(
  new URL("./ChatPage.tsx", import.meta.url),
  "utf8",
);
const experienceCss = readFileSync(
  new URL("./experience.css", import.meta.url),
  "utf8",
);
const threadWorkbenchCss = readFileSync(
  new URL("./thread-workbench.css", import.meta.url),
  "utf8",
);

describe("thread workbench viewport layout contract", () => {
  it("mounts the workbench as a dedicated sibling pane beside the chat conversation", () => {
    expect(chatPage).toMatch(
      /<section className="chat-conversation"[\s\S]*?<\/section>[\s\S]*?\{inspectorVisible \? \([\s\S]*?<div id="thread-workbench">[\s\S]*?<ThreadWorkbenchRail/s,
    );
    expect(experienceCss).toMatch(
      /\.chat-workspace > #thread-workbench\s*{[^}]*align-self:\s*stretch;[^}]*display:\s*flex;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(experienceCss).not.toMatch(
      /\.chat-workspace > #thread-workbench\s*{[^}]*display:\s*contents;/s,
    );
  });

  it("keeps workbench sections inside nested scroll containers instead of hard-coded page-height math", () => {
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench\s*{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-panel\s*{[^}]*display:\s*flex;[^}]*flex:\s*1 1 auto;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-split,\s*\.thread-workbench-terminal\s*{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;[^}]*min-height:\s*0;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-(brief|plan-list|settings|preview-status)[\s\S]*?flex:\s*1 1 auto;/s,
    );
    expect(threadWorkbenchCss).not.toContain("calc(100% - 42px)");
  });
});
