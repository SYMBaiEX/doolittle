import { readFileSync } from "node:fs";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import {
  CODING_BREADCRUMB_CLASS,
  CODING_EDITOR_ACTIONS_CLASS,
  CODING_EDITOR_CLASS,
  CODING_EDITOR_TOOLBAR_CLASS,
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

  it("keeps three coding panes at laptop widths and stacks them below 960px", () => {
    expect(codingWorkspaceLayout).not.toContain("min-h-[1080px]");
    expect(codingWorkspaceLayout).not.toContain("min-h-[300px]");
    expect(codingWorkspaceLayout).not.toContain("max-[1320px]:");
    expect(codingWorkspaceLayout).toContain("max-[960px]:grid-cols-1");
    expect(codingWorkspaceLayout).toContain(
      "max-[960px]:grid-rows-[auto_minmax(15rem,1fr)_auto]",
    );
    expect(codingWorkspaceLayout).toContain("max-[960px]:overflow-visible");
    expect(codingWorkspaceLayout).toContain(
      "max-[960px]:min-h-[clamp(8rem,20svh,11rem)]",
    );
    expect(codingWorkspaceLayout).toContain(
      "max-[960px]:min-h-[clamp(15rem,38svh,22rem)]",
    );
    expect(codingWorkspaceLayout).toContain("max-[960px]:hidden");
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
