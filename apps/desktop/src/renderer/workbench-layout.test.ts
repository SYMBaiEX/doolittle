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
const appPolishCss = readFileSync(
  new URL("./app-polish.css", import.meta.url),
  "utf8",
);

describe("thread workbench viewport layout contract", () => {
  it("mounts the workbench as a dedicated sibling pane beside the chat conversation", () => {
    expect(chatPage).toMatch(
      /<section[\s\S]*?className="chat-conversation"[\s\S]*?<\/section>[\s\S]*?\{inspectorVisible \? \([\s\S]*?<div[\s\S]*?\{\.\.\.workbenchAccessibilityProps\}[\s\S]*?className="chat-workbench-pane"[\s\S]*?id="thread-workbench"[\s\S]*?<Suspense[\s\S]*?<ThreadWorkbenchRail/s,
    );
    expect(chatPage).toContain(
      "const ThreadWorkbenchRail = lazy(async () => {",
    );
    expect(chatPage).not.toContain(
      'ThreadWorkbenchRail,\n} from "./components/ThreadWorkbenchRail"',
    );
    expect(chatPage).toContain(
      'const NARROW_WORKBENCH_QUERY = "(max-width: 720px)";',
    );
    expect(chatPage).toContain('role: "dialog" as const');
    expect(chatPage).toContain('role: "region" as const');
    expect(chatPage).toContain("{...workbenchAccessibilityProps}");
    expect(chatPage).toContain("inert={inspectorVisible && isNarrowWorkbench}");
    expect(chatPage).toContain(
      "const workbenchDialogRef = useModalFocusBoundary({",
    );
    expect(chatPage).toContain("restoreFocus: !inspectorVisible");
    expect(experienceCss).toMatch(
      /\.chat-workspace > #thread-workbench\s*{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;[^}]*align-self:\s*stretch;[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(experienceCss).toMatch(
      /\.chat-conversation\s*{[^}]*display:\s*grid;[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto;/s,
    );
    expect(experienceCss).toMatch(
      /\.chat-workspace > \.chat-conversation\s*{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1;/s,
    );
    expect(experienceCss).toMatch(
      /\.chat-messages\s*{[^}]*min-height:\s*0;[^}]*min-width:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(experienceCss).toMatch(
      /\.chat-workspace,\s*\.chat-workspace\.inspector-open\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);[^}]*grid-template-rows:\s*minmax\(0, 1fr\);[^}]*align-items:\s*stretch;/s,
    );
    expect(experienceCss).not.toMatch(
      /\.chat-workspace > #thread-workbench\s*{[^}]*display:\s*contents;/s,
    );
    expect(experienceCss).not.toMatch(
      /\.chat-workspace\.inspector-open > #thread-workbench\s*{[^}]*position:\s*absolute;/s,
    );
    expect(appPolishCss).not.toContain(
      ':root[data-density="compact"] .chat-workspace.inspector-open',
    );
    expect(threadWorkbenchCss).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.chat-workspace\.inspector-open > #thread-workbench\s*{[^}]*position:\s*fixed;[^}]*z-index:\s*120;[^}]*inset:\s*0;[^}]*width:\s*100%;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.thread-workbench\s*{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*none;[^}]*flex:\s*1 1 auto;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.thread-workbench-resizer\s*{[^}]*display:\s*none;/s,
    );
  });

  it("keeps workbench sections inside nested scroll containers instead of hard-coded page-height math", () => {
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench\s*{[^}]*height:\s*100%;[^}]*max-height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-panel\s*{[^}]*display:\s*grid;[^}]*flex:\s*1 1 auto;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*min-height:\s*0;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-panel-body--(files|terminal)\s*{[^}]*display:\s*flex;[^}]*flex:\s*1 1 auto;[^}]*flex-direction:\s*column;[^}]*gap:\s*10px;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-panel-body--changes\s*{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(140px, 0\.96fr\) minmax\(180px, 1\.04fr\);[^}]*gap:\s*10px;[^}]*min-height:\s*0;[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-split,\s*\.thread-workbench-terminal\s*{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;[^}]*min-height:\s*0;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-split,\s*\.thread-workbench-terminal\s*{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-(brief|plan-list|settings|preview-status)[\s\S]*?flex:\s*1 1 auto;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-pane-stack\s*{[^}]*display:\s*grid;[^}]*gap:\s*10px;[^}]*min-height:\s*0;[^}]*min-width:\s*0;[^}]*overflow:\s*auto;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-pane-stack\s*{[^}]*scrollbar-gutter:\s*stable;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-pane-stack > \.git-control-panel \.git-control-scroll\s*{[^}]*min-height:\s*0;[^}]*max-height:\s*100%;[^}]*overscroll-behavior:\s*contain;/s,
    );
    expect(threadWorkbenchCss).not.toContain("calc(100% - 42px)");
    expect(threadWorkbenchCss).not.toMatch(
      /@media \(max-width: 880px\)[\s\S]*?\.thread-workbench\s*{[^}]*position:\s*fixed;/s,
    );
  });

  it("avoids an implicit second grid row when the sidebar opens", () => {
    expect(experienceCss).toMatch(
      /\.chat-workspace\.inspector-open\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s,
    );
    expect(experienceCss).not.toMatch(
      /\.chat-workspace(?:\.inspector-open)?\s*{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)\s+auto;/s,
    );
    expect(experienceCss).not.toMatch(
      /\.chat-workspace > #thread-workbench\s*{[^}]*grid-row:\s*2;/s,
    );
  });

  it("keeps the compact tab strip inside a narrow sidebar", () => {
    expect(threadWorkbenchCss).toMatch(
      /\.thread-workbench-tabs\s*{[^}]*grid-template-columns:\s*repeat\(7, minmax\(0, 1fr\)\);[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /@media \(max-width: 1180px\)[\s\S]*?\.thread-workbench-repository small\s*{[^}]*display:\s*none;/s,
    );
    expect(threadWorkbenchCss).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.thread-workbench-tabs button small\s*{[^}]*display:\s*none;/s,
    );
  });
});
