import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GatewayPairingPanel } from "./GatewayPairingPanel";

const renderPanel = (open: boolean) =>
  renderToStaticMarkup(
    <GatewayPairingPanel
      actionId=""
      approved={[
        {
          approvedAt: "2026-08-12T10:01:00.000Z",
          id: "approved-1",
          platform: "telegram",
          userId: "approved-user",
        },
      ]}
      confirmationId=""
      error=""
      loading={false}
      onConfirmationChange={() => undefined}
      onOpenChange={() => undefined}
      onRetry={() => undefined}
      onUpdate={() => undefined}
      open={open}
      pending={[
        {
          code: "ABCDEFGH",
          createdAt: "2026-08-12T10:00:00.000Z",
          id: "pending-1",
          platform: "telegram",
          userId: "pending-user",
        },
      ]}
      truncated={false}
    />,
  );

describe("GatewayPairingPanel", () => {
  it("keeps pairing records out of the closed disclosure", () => {
    const html = renderPanel(false);

    expect(html).toContain("Load approvals");
    expect(html).not.toContain("pending-user");
    expect(html).not.toContain("approved-user");
  });

  it("renders official pairing controls after an explicit open", () => {
    const html = renderPanel(true);

    expect(html).toContain("1 pending · 1 approved");
    expect(html).toContain("pending-user");
    expect(html).toContain("approved-user");
    expect(html).toContain("ABCDEFGH");
    expect(html).toContain("Messaging allowlist only");
    expect(html).not.toContain("Secure device access");
  });
});
