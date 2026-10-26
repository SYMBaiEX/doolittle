// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "../../apps/desktop/src/renderer/components/MessageContent";
import type { ToolActivity } from "../../apps/desktop/src/renderer/components/message-output";
import { WalletActivityCard } from "../../apps/desktop/src/renderer/components/WalletActivityCard";

const receipt = {
  status: "prepared",
  subaction: "swap",
  chain: "Base",
  chainId: "8453",
  mode: "prepare",
  dryRun: false,
  amount: "0.123456789012345678",
  fromToken: "ETH",
  toToken: "USDC",
};
function activity(
  data: Record<string, unknown> = receipt,
  overrides: Partial<ToolActivity> = {},
): ToolActivity {
  return {
    id: "wallet-swap",
    name: "WALLET_SWAP",
    status: "completed",
    output: { success: true, data },
    ...overrides,
  };
}
function card(value: ToolActivity): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <WalletActivityCard activity={value} />,
  );
  return container;
}

describe("wallet activity widget", () => {
  it("shows precise prepared amounts in chat without claiming submission", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <MessageContent
        content=""
        parsedAgentMessage={{
          text: "",
          tools: [activity()],
          steps: { continued: 0, failed: 0, finished: 0 },
        }}
      />,
    );
    const widget = container.querySelector('[aria-label="Wallet swap"]');
    expect(widget?.textContent).toContain("Swap · Base");
    expect(widget?.textContent).toContain("Prepared · not sent");
    expect(widget?.textContent).toContain("0.123456789012345678 ETH → USDC");
    expect(widget?.textContent).not.toContain("Submitted");
  });

  it("distinguishes simulation from submitted transactions awaiting confirmation", () => {
    expect(card(activity({ ...receipt, dryRun: true })).textContent).toContain(
      "Simulation · not sent",
    );
    const transactionHash = `0x${"a".repeat(64)}`;
    const submitted = card(
      activity({
        ...receipt,
        status: "submitted",
        mode: "execute",
        transactionHash,
      }),
    );
    expect(submitted.textContent).toContain(
      "Submitted · awaiting confirmation",
    );
    expect(submitted.textContent).toContain(transactionHash);
    expect(submitted.querySelector("a, button")).toBeNull();
  });

  it("ignores pending, failed, unrelated and inconsistent receipts", () => {
    for (const value of [
      activity(receipt, { status: "running" }),
      activity(receipt, { status: "error" }),
      activity(receipt, { name: "READ_FILE" }),
      activity(receipt, { output: { success: false, data: receipt } }),
      activity({ ...receipt, status: "submitted" }),
      activity({ ...receipt, subaction: "unknown" }),
      activity(receipt, { output: "Wallet submitted successfully" }),
    ])
      expect(card(value).innerHTML).toBe("");
  });

  it("renders only public receipt fields and no arbitrary metadata or links", () => {
    const output = {
      success: true,
      data: {
        ...receipt,
        metadata: { privateKey: "private-fixture" },
        transactionHash: "javascript:alert(1)",
      },
    };
    const widget = card(activity(receipt, { output }));
    expect(widget.textContent).not.toContain("private-fixture");
    expect(widget.textContent).not.toContain("javascript:");
    expect(widget.querySelector("a, button, input")).toBeNull();
  });
});
