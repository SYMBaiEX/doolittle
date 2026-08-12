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
const polish = readFileSync(
  new URL("./app-polish.css", import.meta.url),
  "utf8",
);

describe("GatewayPage density", () => {
  it("keeps sender approvals in a concise status disclosure", () => {
    expect(source).toContain("<GatewayPairingPanel");
    expect(pairingSource).toContain('className="panel pairing-panel"');
    expect(pairingSource).toContain("Messaging allowlist");
    expect(pairingSource).toContain("Load approvals");
    expect(pairingSource).toContain("pending.length} pending");
    expect(pairingSource).toContain("approved.length} approved");
    expect(css).toContain(".pairing-panel > summary {");
  });

  it("keeps thread routes in an independently loaded disclosure", () => {
    expect(source).toContain(
      'resourcePolicy.routes ? "/sessions/gateway" : null',
    );
    expect(source).toContain('className="panel gateway-session-panel"');
    expect(source).toContain("Load routes");
    expect(source).toContain('className="gateway-secondary-grid"');
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain(".gateway-secondary-grid > .panel {");
    expect(css).toContain("border: 1px solid var(--border)");
    expect(css).toContain(".gateway-session-panel > summary {");
    expect(polish).not.toContain("minmax(230px, 310px)");
    expect(polish).not.toContain(
      ".gateway-page :is(.gateway-timeline-panel, .gateway-session-panel)",
    );
  });
});
