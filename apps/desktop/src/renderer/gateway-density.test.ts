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
const timelineSource = readFileSync(
  new URL("./gateway/GatewayTimelinePanel.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("./gateway/gateway-layout.ts", import.meta.url),
  "utf8",
);

describe("GatewayPage density", () => {
  it("keeps sender approvals in a concise status disclosure", () => {
    expect(source).toContain("<GatewayPairingPanel");
    expect(pairingSource).toContain(
      'className="pairing-panel group panel grid gap-2.5"',
    );
    expect(pairingSource).toContain("GATEWAY_DISCLOSURE_SUMMARY_CLASS");
    expect(pairingSource).toContain("Messaging allowlist");
    expect(pairingSource).toContain("Load approvals");
    expect(pairingSource).toContain("pending.length} pending");
    expect(pairingSource).toContain("approved.length} approved");
    expect(pairingSource).toContain("group-open:after:content-['−']");
  });

  it("keeps thread routes in an independently loaded disclosure", () => {
    expect(source).toContain(
      'resourcePolicy.routes ? "/sessions/gateway" : null',
    );
    expect(source).toContain(
      'className="group panel min-w-0 overflow-hidden p-0"',
    );
    expect(source).toContain("Load routes");
    expect(source).toContain("GATEWAY_SECONDARY_GRID_CLASS");
    expect(layoutSource).toContain("grid-cols-2");
    expect(layoutSource).toContain("max-[1060px]:grid-cols-1");
    expect(layoutSource).toContain("[&>.panel]:border-[var(--border)]");
  });

  it("uses a compact status rail instead of a full empty history panel", () => {
    expect(timelineSource).toContain('data-gateway-history-state="empty"');
    expect(layoutSource).toContain("min-h-14.5");
    expect(timelineSource).toContain("motion-reduce:animate-none");
  });
});
