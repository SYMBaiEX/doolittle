import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./GatewayPage.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./gateway-page.css", import.meta.url),
  "utf8",
);

describe("GatewayPage density", () => {
  it("keeps sender approvals in a concise status disclosure", () => {
    expect(source).toContain('<details className="panel pairing-panel"');
    expect(source).toContain("{pendingPairings.length} pending");
    expect(source).toContain("{approvedPairings.length}");
    expect(source).toContain("approved");
    expect(css).toContain(".pairing-panel > summary {");
  });
});
