import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { VIEW_CONTAINER_CLASS } from "./app-shell/shell-layout";
import {
  CODING_ACP_TASK_ROW_CLASS,
  CODING_BREADCRUMB_CLASS,
  CODING_EDITOR_ACTIONS_CLASS,
  CODING_EDITOR_CLASS,
  CODING_EDITOR_STATUS_CLASS,
  CODING_EDITOR_TOOLBAR_CLASS,
  CODING_EXPLORER_CLASS,
  CODING_EXPLORER_RESIZER_CLASS,
  CODING_REPO_HEADER_CLASS,
  CODING_REPO_IDENTITY_CLASS,
  CODING_REPO_STATE_CLASS,
  CODING_REPO_TITLE_CLASS,
  CODING_UNSAVED_CLASS,
  CODING_UTILITY_CLASS,
  CODING_UTILITY_RESIZER_CLASS,
  CODING_WORKSPACE_PAGE_CLASS,
  codingGridClass,
} from "./coding-workspace/layout";

const codingWorkspaceLayout = readFileSync(
  new URL("./coding-workspace/layout.ts", import.meta.url),
  "utf8",
);
const browserLayout = readFileSync(
  new URL("./browser/browser-layout.ts", import.meta.url),
  "utf8",
);

describe("workspace responsive layout contracts", () => {
  it("compiles bounded wrapping footer metadata without hiding actions or clipping the page", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(CODING_EDITOR_STATUS_CLASS.split(/\s+/u));
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("min-width: 0px");
    expect(css).toContain("> span {");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("white-space: normal");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("> button {");
    expect(css).toContain("flex-shrink: 0");
    expect(css).not.toContain("white-space: nowrap");
    expect(css).not.toContain("overflow: hidden");
    expect(css).not.toContain("display: none");
    expect(CODING_WORKSPACE_PAGE_CLASS).not.toContain("overflow-x-hidden");
  });

  it("compiles actual-editor-width ACP task bands with a shrinkable input and retained decisions", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const candidates = CODING_ACP_TASK_ROW_CLASS.split(/\s+/u).filter(
      (candidate) => candidate.startsWith("@max-[640px]/code:"),
    );
    expect(candidates).toHaveLength(2);
    const css = compiler.build(candidates);
    expect(css).toContain("@container code (width < 640px)");
    expect(css).toContain("grid-template-columns: minmax(0,1fr) auto auto");
    expect(css).toContain("> label {");
    expect(css).toContain("grid-column: 1 / -1");
    expect(css).not.toContain("@media");
    expect(css).not.toContain("display: none");
    expect(CODING_ACP_TASK_ROW_CLASS).toContain("[&_input]:min-w-0");
    expect(CODING_ACP_TASK_ROW_CLASS).not.toMatch(/(?:^|\s|:)order-/u);
  });

  it("compiles intrinsic repository header bands without a brittle viewport hinge", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const headerCss = compiler.build(
      [
        CODING_REPO_HEADER_CLASS,
        CODING_REPO_IDENTITY_CLASS,
        CODING_REPO_STATE_CLASS,
        CODING_REPO_TITLE_CLASS,
      ].flatMap((className) => className.split(/\s+/u)),
    );
    expect(CODING_REPO_HEADER_CLASS).toContain("flex-wrap");
    expect(CODING_REPO_TITLE_CLASS).toContain("flex-wrap");
    expect(CODING_REPO_STATE_CLASS).toContain("flex-wrap");
    expect(CODING_REPO_STATE_CLASS).not.toContain("shrink-0");
    expect(headerCss).toContain("flex-wrap: wrap");
    expect(headerCss).toContain("flex: 1 1 18rem");
    expect(headerCss).toContain("flex: 0 1 auto");
    expect(headerCss).toContain("max-width: 100%");
    expect(headerCss).toContain("min-width: 0px");
    expect(headerCss).toContain("> div:last-child {");
    expect(headerCss).toContain("flex: 1");
    expect(headerCss).toContain("h1 {");
    expect(headerCss).toContain("code {");
    expect(headerCss).toContain("text-overflow: ellipsis");
    expect(headerCss).toContain(".badge {");
    expect(headerCss).toContain("flex-shrink: 0");
    expect(headerCss).not.toContain("@media");
    expect(CODING_REPO_TITLE_CLASS).not.toContain("35vw");
    expect(CODING_REPO_HEADER_CLASS).not.toContain("hidden");
    expect(CODING_REPO_STATE_CLASS).not.toContain("hidden");
  });

  it("preserves an unsaved status dot without ornamental bloom", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(CODING_UNSAVED_CLASS.split(/\s+/u));
    expect(css).toContain("background-color: var(--accent)");
    expect(css).toContain("border-radius: calc(infinity * 1px)");
    expect(css).toContain("calc(var(--spacing) * 1.5)");
    expect(css).not.toContain("box-shadow");
    expect(css).not.toContain("animation");
  });

  it("compiles editor-width toolbar bands and bounded language labels", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const css = compiler.build(
      [
        CODING_EDITOR_CLASS,
        CODING_EDITOR_TOOLBAR_CLASS,
        CODING_BREADCRUMB_CLASS,
        CODING_EDITOR_ACTIONS_CLASS,
      ].flatMap((className) => className.split(/\s+/u)),
    );

    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("container-name: code");
    expect(css).toContain("@container code (width < 480px)");
    expect(css).toContain("grid-template-columns: auto minmax(0,1fr)");
    expect(css).toContain("grid-column: 1 / -1");
    expect(CODING_EDITOR_ACTIONS_CLASS).toContain("flex-wrap");
    expect(CODING_EDITOR_ACTIONS_CLASS).toContain("[&_button]:shrink-0");
    expect(CODING_EDITOR_ACTIONS_CLASS).not.toContain("hidden");
    expect(CODING_BREADCRUMB_CLASS).toContain("[&>span]:flex-1");
    expect(CODING_BREADCRUMB_CLASS).not.toContain("[&>small]:shrink-0");
    expect(css).toContain("max-width: calc(1 / 2 * 100%)");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).toContain("> small {");
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("button {");
    expect(css).toContain("flex-shrink: 0");
  });

  it("uses the actual Code route width to stack every pane configuration inside a bounded scrollport", async () => {
    const compiler = await compile(
      "@theme { --spacing: .25rem; } @tailwind utilities;",
    );
    const containerCandidates = VIEW_CONTAINER_CLASS.split(/\s+/u).filter(
      (candidate) => candidate.includes(".view-code"),
    );
    expect(containerCandidates).toHaveLength(2);
    const containerCss = compiler.build(containerCandidates);
    expect(containerCss).toContain(".view-code {");
    expect(containerCss).toContain("container-type: inline-size");
    expect(containerCss).toContain("container-name: coding-route");
    expect(containerCss).not.toContain("view-chat");

    const classes = [
      CODING_WORKSPACE_PAGE_CLASS,
      CODING_EXPLORER_CLASS,
      CODING_EDITOR_CLASS,
      CODING_UTILITY_CLASS,
      CODING_EXPLORER_RESIZER_CLASS,
      CODING_UTILITY_RESIZER_CLASS,
      ...[true, false].flatMap((explorer) =>
        [true, false].map((utility) =>
          codingGridClass(explorer, utility, false),
        ),
      ),
    ];
    const css = compiler.build(classes.flatMap((value) => value.split(/\s+/u)));
    expect(css).toContain("@container coding-route (width < 960px)");
    expect(css).not.toContain("@media");
    expect(css).toContain("grid-template-columns: repeat(1, minmax(0, 1fr))");
    expect(css).toContain("grid-auto-rows: auto");
    expect(css).toContain("flex: none");
    expect(css).toContain("overflow: visible");
    expect(css).toContain("overflow: auto");
    expect(css).toContain("height: 100%");
    expect(css).toContain("height: clamp(8rem, 20svh, 11rem)");
    expect(css).toContain("height: clamp(15rem, 38svh, 22rem)");
    expect(css).toContain("height: clamp(10rem, 24svh, 14rem)");
    expect(css).toContain("display: none");
    expect(css).toContain("var(--coding-explorer-width)");
    expect(css).toContain("var(--coding-utility-width)");
    expect(css).toContain("minmax(210px,var(--coding-explorer-width))");
    expect(css).toContain("minmax(270px,var(--coding-utility-width))");
    expect(css).toContain("minmax(320px,1fr)");
    expect(css).not.toContain("minmax(220px");
    expect(CODING_WORKSPACE_PAGE_CLASS).toContain("h-full");
    expect(CODING_WORKSPACE_PAGE_CLASS).not.toContain("h-auto");
    expect(codingWorkspaceLayout).not.toContain("min-h-[1080px]");
    expect(codingWorkspaceLayout).not.toContain("min-h-[300px]");
    expect(codingWorkspaceLayout).not.toContain("max-[1320px]:");
    expect(codingWorkspaceLayout).not.toContain("max-[960px]:");
    expect(codingWorkspaceLayout).toContain(
      "@max-[960px]/coding-route:grid-cols-1",
    );
    expect(codingWorkspaceLayout).toContain(
      "@max-[960px]/coding-route:overflow-visible",
    );
    expect(codingWorkspaceLayout).toContain(
      "@max-[960px]/coding-route:overflow-auto",
    );
    expect(CODING_EXPLORER_RESIZER_CLASS).toContain(
      "@max-[960px]/coding-route:hidden",
    );
    expect(CODING_UTILITY_RESIZER_CLASS).toContain(
      "@max-[960px]/coding-route:hidden",
    );
    expect(codingWorkspaceLayout).not.toContain("grid-rows-[auto_minmax");
  });

  it("lets the browser workspace flow naturally on narrow screens", () => {
    expect(browserLayout).not.toContain("min-h-[880px]");
    expect(browserLayout).not.toContain("min-h-[480px]");
    expect(browserLayout).toContain("max-[1080px]:flex-none");
    expect(browserLayout).toContain("max-[1080px]:grid-cols-1");
    expect(browserLayout).toContain("max-[1080px]:overflow-visible");
    expect(browserLayout).toContain(
      "max-[1080px]:min-h-[clamp(15rem,48svh,22rem)]",
    );
  });

  it("keeps browser evidence actions paired while the side panel remains visible", () => {
    expect(browserLayout).toContain("grid-cols-2");
    expect(browserLayout).toContain("max-[1080px]:grid-cols-1");
    expect(
      readFileSync(new URL("./BrowserPage.tsx", import.meta.url), "utf8"),
    ).toContain(
      'action.id === "analyze"\n                    ? "col-span-full',
    );
  });
});
