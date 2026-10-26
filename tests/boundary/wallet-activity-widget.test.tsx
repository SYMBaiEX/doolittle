// @vitest-environment jsdom
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseWalletActivityReceipt,
  walletActivityFromAction,
} from "@doolittle/contracts/wallet-activity";
import { EventType } from "@elizaos/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "../../apps/desktop/src/renderer/chat/ChatMessage";
import { historicalRunReceipt } from "../../apps/desktop/src/renderer/chat/models";
import { WalletActivityCard } from "../../apps/desktop/src/renderer/components/WalletActivityCard";
import { createRunProgressEvents } from "../../packages/agent/src/runtime/bootstrap/runtime/run-progress";
import type { AppServices } from "../../packages/agent/src/services";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service";

const execution = {
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
function card(value: unknown): HTMLElement {
  const receipt = parseWalletActivityReceipt(value);
  const container = document.createElement("div");
  container.innerHTML = receipt
    ? renderToStaticMarkup(<WalletActivityCard receipt={receipt} />)
    : "";
  return container;
}

describe("wallet activity widget", () => {
  it("shows precise prepared amounts without claiming submission", () => {
    const widget = card(execution);
    expect(widget.textContent).toContain("Swap · Base");
    expect(widget.textContent).toContain("Prepared · not sent");
    expect(widget.textContent).toContain("0.123456789012345678 ETH → USDC");
    expect(widget.textContent).not.toContain("Submitted");
  });
  it("distinguishes simulation from submitted transactions awaiting confirmation", () => {
    expect(card({ ...execution, dryRun: true }).textContent).toContain(
      "Simulation · not sent",
    );
    const transactionHash = `0x${"a".repeat(64)}`;
    const submitted = card({
      ...execution,
      status: "submitted",
      mode: "execute",
      transactionHash,
    });
    expect(submitted.textContent).toContain(
      "Submitted · awaiting confirmation",
    );
    expect(submitted.textContent).toContain(transactionHash);
    expect(submitted.querySelector("a, button")).toBeNull();
  });
  it("rejects failed, unrelated and inconsistent action results and strips private metadata", () => {
    for (const [action, result] of [
      ["READ_FILE", { success: true, data: execution }],
      ["WALLET_SWAP", { success: false, data: execution }],
      [
        "WALLET_SWAP",
        { success: true, data: { ...execution, status: "submitted" } },
      ],
      [
        "WALLET_SWAP",
        { success: true, data: { ...execution, subaction: "unknown" } },
      ],
    ] as const)
      expect(walletActivityFromAction(action, result)).toBeUndefined();
    const receipt = walletActivityFromAction("WALLET_SWAP", {
      success: true,
      data: { ...execution, metadata: { privateKey: "private-fixture" } },
    });
    expect(receipt).toBeDefined();
    expect(JSON.stringify(receipt)).not.toContain("private-fixture");
    expect(card(receipt).querySelector("a, button, input")).toBeNull();
    expect(
      card({ ...execution, transactionHash: "javascript:alert(1)" }).innerHTML,
    ).toBe("");
  });

  it("projects native SDK wallet events into the right chat and retains the widget after restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "doolittle-wallet-receipts-"));
    const controller = new RunControllerService(dataDir);
    let restored: RunControllerService | undefined;
    try {
      for (const name of ["first", "other"])
        controller.startTurn({
          sessionId: name,
          roomId: name,
          runId: `run-${name}`,
          source: "desktop",
          message: "Prepare a swap",
          runDepth: "standard",
          configuredMaxIterations: 45,
          progressMode: "off",
        });
      const services = {
        runController: controller,
        settings: { get: () => ({ model: {} }) },
      } as AppServices;
      const handlers =
        createRunProgressEvents(services)[EventType.ACTION_COMPLETED] ?? [];
      const result = {
        success: true,
        data: { ...execution, metadata: { secret: "private-fixture" } },
      };
      for (const handler of handlers)
        await handler({
          roomId: "first",
          runId: "run-first",
          content: { actions: ["WALLET_SWAP"], actionResult: result },
        } as never);
      expect(controller.getByRoomId("first")?.walletActivities).toHaveLength(1);
      expect(controller.getByRoomId("other")?.walletActivities).toBeUndefined();
      controller.recordRuntimeWalletActivity(
        "first",
        "WALLET_SWAP",
        result,
        "stale-run",
      );
      expect(controller.getByRoomId("first")?.walletActivities).toHaveLength(1);
      controller.finishTurn("first", "complete");
      controller.dispose();
      restored = new RunControllerService(dataDir);
      const run = restored
        .listReceipts()
        .find((value) => value.runId === "run-first");
      expect(JSON.stringify(run)).not.toContain("private-fixture");
      const receipt = historicalRunReceipt(run, []);
      expect(receipt?.latest.run.walletActivities).toHaveLength(1);
      const markup = renderToStaticMarkup(
        <ChatMessage
          message={{
            id: "message",
            runId: "run-first",
            role: "assistant",
            content: "Swap prepared.",
            createdAt: new Date().toISOString(),
          }}
          receipt={receipt ?? undefined}
          actions={null}
        />,
      );
      expect(markup).toContain('data-wallet-activity="true"');
      expect(markup).toContain("Prepared · not sent");
    } finally {
      controller.dispose();
      restored?.dispose();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
