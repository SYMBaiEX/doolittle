import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_WORKSPACE_CLASS } from "./chat/layout";
import {
  WORKBENCH_CHANGES_BODY_CLASS,
  WORKBENCH_COMMAND_BUTTON_CLASS,
  WORKBENCH_CONTEXT_COPY_CLASS,
  WORKBENCH_FILES_BODY_CLASS,
  WORKBENCH_LIST_BUTTON_CLASS,
  WORKBENCH_PANE_STACK_CLASS,
  WORKBENCH_PANEL_CLASS,
  WORKBENCH_PREVIEW_CLASS,
  WORKBENCH_RAIL_CLASS,
  WORKBENCH_RESIZER_CLASS,
  WORKBENCH_SCROLL_BODY_CLASS,
  WORKBENCH_SPLIT_CLASS,
  WORKBENCH_TAB_CLASS,
  WORKBENCH_TABS_CLASS,
  WORKBENCH_TERMINAL_BODY_CLASS,
  WORKBENCH_TREE_CLASS,
} from "./thread-workbench/layout";

const chatPage = readFileSync(
  new URL("./ChatPage.tsx", import.meta.url),
  "utf8",
);

describe("thread workbench viewport layout contract", () => {
  it("mounts the workbench as a dedicated sibling pane beside chat", () => {
    expect(chatPage).toMatch(
      /<section[\s\S]*?className="chat-conversation"[\s\S]*?<\/section>[\s\S]*?\{inspectorVisible \? \([\s\S]*?<div[\s\S]*?\{\.\.\.workbenchAccessibilityProps\}[\s\S]*?chat-workbench-pane[\s\S]*?id="thread-workbench"[\s\S]*?<Suspense[\s\S]*?<ThreadWorkbenchRail/s,
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
    expect(chatPage).toMatch(
      /const workbenchDialogRef = useModalFocusBoundary\(\{[\s\S]*?isolateBackground: true,/,
    );
    expect(chatPage).toContain("restoreFocus: !inspectorVisible");
    expect(chatPage).toContain(
      "max-[720px]:fixed max-[720px]:inset-0 max-[720px]:z-120 max-[720px]:w-full",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain("[&>#thread-workbench]:col-start-2");
    expect(CHAT_WORKSPACE_CLASS).toContain("[&>#thread-workbench]:row-start-1");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&>#thread-workbench]:self-stretch",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&>#thread-workbench]:overflow-hidden",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain("[&_.chat-conversation]:grid");
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&_.chat-conversation]:grid-rows-[minmax(0,1fr)_auto]",
    );
    expect(CHAT_WORKSPACE_CLASS).not.toContain("display:contents");
    expect(WORKBENCH_RAIL_CLASS).toContain("max-[720px]:w-full");
    expect(WORKBENCH_RAIL_CLASS).toContain("max-[720px]:min-w-0");
    expect(WORKBENCH_RAIL_CLASS).toContain("max-[720px]:max-w-none");
    expect(WORKBENCH_RAIL_CLASS).toContain("max-[720px]:flex-1");
    expect(WORKBENCH_RESIZER_CLASS).toContain("max-[720px]:hidden");
  });

  it("keeps sections inside nested scroll containers", () => {
    for (const token of [
      "h-full",
      "max-h-full",
      "min-h-0",
      "overflow-hidden",
    ]) {
      expect(WORKBENCH_RAIL_CLASS).toContain(token);
    }
    for (const token of [
      "grid",
      "flex-1",
      "grid-rows-[auto_minmax(0,1fr)]",
      "min-h-0",
      "min-w-0",
      "overflow-hidden",
    ]) {
      expect(WORKBENCH_PANEL_CLASS).toContain(token);
    }
    for (const bodyClass of [
      WORKBENCH_FILES_BODY_CLASS,
      WORKBENCH_TERMINAL_BODY_CLASS,
    ]) {
      expect(bodyClass).toContain("flex");
      expect(bodyClass).toContain("flex-1");
      expect(bodyClass).toContain("flex-col");
      expect(bodyClass).toContain("gap-2.5");
      expect(bodyClass).toContain("overflow-hidden");
    }
    expect(WORKBENCH_CHANGES_BODY_CLASS).toContain(
      "grid-rows-[minmax(140px,0.96fr)_minmax(180px,1.04fr)]",
    );
    expect(WORKBENCH_SPLIT_CLASS).toContain("min-h-37.5");
    expect(WORKBENCH_SPLIT_CLASS).toContain("min-w-0");
    expect(WORKBENCH_SPLIT_CLASS).toContain("overflow-hidden");
    expect(WORKBENCH_SCROLL_BODY_CLASS).toContain("flex-1");
    expect(WORKBENCH_SCROLL_BODY_CLASS).toContain("overflow-auto");
    expect(WORKBENCH_PANE_STACK_CLASS).toContain("overflow-auto");
    expect(WORKBENCH_PANE_STACK_CLASS).toContain("overscroll-contain");
    expect(WORKBENCH_PANE_STACK_CLASS).toContain("[scrollbar-gutter:stable]");
    expect(WORKBENCH_PANE_STACK_CLASS).toContain(
      "[&>.git-control-panel_.git-control-scroll]:max-h-full",
    );
    expect(WORKBENCH_RAIL_CLASS).not.toContain("calc(100% - 42px)");
  });

  it("avoids an implicit second grid row when the sidebar opens", () => {
    expect(CHAT_WORKSPACE_CLASS).toContain(
      "[&.inspector-open]:grid-cols-[minmax(0,1fr)_auto]",
    );
    expect(CHAT_WORKSPACE_CLASS).toContain("grid-rows-[minmax(0,1fr)]");
    expect(CHAT_WORKSPACE_CLASS).not.toContain(
      "[&>#thread-workbench]:row-start-2",
    );
  });

  it("keeps the compact tab strip inside a narrow sidebar", () => {
    expect(WORKBENCH_TABS_CLASS).toContain("grid-cols-7");
    expect(WORKBENCH_TABS_CLASS).toContain("min-w-0");
    expect(WORKBENCH_TABS_CLASS).toContain("overflow-hidden");
    expect(WORKBENCH_TAB_CLASS).toContain("place-items-center");
    expect(WORKBENCH_RAIL_CLASS).toContain(
      "max-[1180px]:min-w-[min(var(--thread-workbench-width),44vw)]",
    );
  });

  it("keeps workbench surfaces theme-responsive and keyboard-visible", () => {
    for (const surface of [WORKBENCH_TREE_CLASS, WORKBENCH_PREVIEW_CLASS]) {
      expect(surface).not.toContain("black_");
      expect(surface).not.toContain("white_");
      expect(surface).toContain("var(--");
    }
    expect(WORKBENCH_CONTEXT_COPY_CLASS).not.toContain(
      "max-[960px]:[&_strong]:text-[10px]",
    );
    for (const control of [
      WORKBENCH_LIST_BUTTON_CLASS,
      WORKBENCH_COMMAND_BUTTON_CLASS,
    ]) {
      expect(control).toContain("focus-visible:outline-[var(--accent-border)]");
      expect(control).toContain("text-[length:var(--text-meta)]");
      expect(control).not.toContain("focus-visible:outline-none");
    }
  });
});
