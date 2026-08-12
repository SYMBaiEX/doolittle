import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const codingWorkspaceCss = readFileSync(
  new URL("./coding-workspace.css", import.meta.url),
  "utf8",
);
const browserCss = readFileSync(
  new URL("./browser.css", import.meta.url),
  "utf8",
);

describe("workspace responsive layout contracts", () => {
  it("uses compact, content-led coding panes below 760px instead of a fixed scaffold", () => {
    expect(codingWorkspaceCss).not.toContain("min-height: 1080px");
    expect(codingWorkspaceCss).not.toContain("min-height: 300px");
    expect(codingWorkspaceCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.coding-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*grid-template-rows:\s*auto minmax\(13rem, 1fr\) auto;[^}]*overflow:\s*visible;/u,
    );
    expect(codingWorkspaceCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.coding-explorer\s*\{[^}]*min-height:\s*clamp\(7rem, 18svh, 8\.5rem\);/u,
    );
    expect(codingWorkspaceCss).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.coding-editor\s*\{[^}]*min-height:\s*clamp\(13rem, 34svh, 16rem\);/u,
    );
  });

  it("lets the browser workspace flow naturally on narrow screens", () => {
    expect(browserCss).not.toContain("min-height: 880px");
    expect(browserCss).not.toContain("min-height: 480px");
    expect(browserCss).toMatch(
      /@media \(max-width: 780px\)[\s\S]*?\.browser-workspace\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*0;[^}]*grid-template-columns:\s*1fr;[^}]*overflow:\s*visible;/u,
    );
    expect(browserCss).toMatch(
      /@media \(max-width: 780px\)[\s\S]*?\.browser-canvas\s*\{[^}]*min-height:\s*clamp\(15rem, 48svh, 22rem\);/u,
    );
  });

  it("keeps browser evidence actions paired while the side panel remains visible", () => {
    const mediumViewport = browserCss.match(
      /@media \(max-width: 1040px\) \{([\s\S]*?)\n\}/u,
    )?.[1];

    expect(mediumViewport).toBeDefined();
    expect(mediumViewport).not.toMatch(
      /\.browser-actions\s*\{[^}]*grid-template-columns:\s*1fr;/u,
    );
    expect(browserCss).toMatch(
      /\.browser-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/u,
    );
  });
});
