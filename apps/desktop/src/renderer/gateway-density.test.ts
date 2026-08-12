import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./GatewayPage.tsx", import.meta.url),
  "utf8",
);
const pairingSource = readFileSync(
  new URL("./gateway/GatewayPairingPanel.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./gateway-page.css", import.meta.url),
  "utf8",
);

describe("GatewayPage density", () => {
  it("keeps sender approvals in a concise status disclosure", () => {
    expect(source).toContain("<GatewayPairingPanel");
    expect(pairingSource).toContain('className="panel pairing-panel"');
    expect(pairingSource).toContain("Open to load");
    expect(pairingSource).toContain("pending.length} pending");
    expect(pairingSource).toContain("approved.length} approved");
    expect(css).toContain(".pairing-panel > summary {");
  });
});
