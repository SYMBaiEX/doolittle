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
  it("uses compact, content-led coding panes below 760px instead of a fixed scaffold", () => {
    expect(codingWorkspaceLayout).not.toContain("min-h-[1080px]");
    expect(codingWorkspaceLayout).not.toContain("min-h-[300px]");
    expect(codingWorkspaceLayout).toContain("max-[760px]:grid-cols-1");
    expect(codingWorkspaceLayout).toContain(
      "max-[760px]:grid-rows-[auto_minmax(13rem,1fr)_auto]",
    );
    expect(codingWorkspaceLayout).toContain("max-[760px]:overflow-visible");
    expect(codingWorkspaceLayout).toContain(
      "max-[760px]:min-h-[clamp(7rem,18svh,8.5rem)]",
    );
    expect(codingWorkspaceLayout).toContain(
      "max-[760px]:min-h-[clamp(13rem,34svh,16rem)]",
    );
  });

  it("lets the browser workspace flow naturally on narrow screens", () => {
    expect(browserLayout).not.toContain("min-h-[880px]");
    expect(browserLayout).not.toContain("min-h-[480px]");
    expect(browserLayout).toContain("max-[780px]:flex-none");
    expect(browserLayout).toContain("max-[780px]:grid-cols-1");
    expect(browserLayout).toContain("max-[780px]:overflow-visible");
    expect(browserLayout).toContain(
      "max-[780px]:min-h-[clamp(15rem,48svh,22rem)]",
    );
  });

  it("keeps browser evidence actions paired while the side panel remains visible", () => {
    expect(browserLayout).toContain("grid-cols-2");
    expect(browserLayout).not.toContain("max-[1040px]:grid-cols-1");
    expect(
      readFileSync(new URL("./BrowserPage.tsx", import.meta.url), "utf8"),
    ).toContain(
      'action.id === "analyze"\n                    ? "col-span-full',
    );
  });
});
