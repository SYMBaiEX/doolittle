import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codingWorkspaceLayout = readFileSync(
  new URL("./coding-workspace/layout.ts", import.meta.url),
  "utf8",
);
const browserLayout = readFileSync(
  new URL("./browser/browser-layout.ts", import.meta.url),
  "utf8",
);

describe("workspace responsive layout contracts", () => {
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
