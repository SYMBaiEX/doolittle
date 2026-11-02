import type {
  IAgentRuntime,
  SendHandlerOutcome,
  SendHandlerReceipt,
} from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { NativeMessageConnectorAdapter } from "../../packages/agent/src/gateway/platforms/native-message-connector-adapter";
import type { DeliveryService } from "../../packages/agent/src/services/delivery-service";

const receipt: SendHandlerReceipt = {
  providerMessageIds: ["remote-1", "remote-2"],
  acceptedAt: 1,
  persistence: { status: "persisted", memoryIds: [] },
};
function fixture(outcome: SendHandlerOutcome | undefined) {
  const sendMessageToTarget = vi.fn().mockResolvedValue(outcome);
  const deliver = vi.fn().mockReturnValue({ id: "local" });
  const runtime = {
    getMessageConnectors: () => [
      { source: "telegram", capabilities: ["send_message"] },
    ],
    sendMessageToTarget,
  } as unknown as IAgentRuntime;
  const adapter = new NativeMessageConnectorAdapter("telegram", runtime, {
    deliver,
  } as unknown as DeliveryService);
  return { adapter, deliver, sendMessageToTarget };
}
for (const outcome of [
  undefined,
  { kind: "duplicate", priorDelivery: "in_flight" },
  { kind: "not_delivered", code: "DENIED", message: "denied" },
  {
    kind: "partially_delivered",
    receipt,
    memories: [],
    code: "PARTIAL",
    message: "partial",
  },
] as const) {
  it(`does not record ${outcome?.kind ?? "unknown"} delivery as success`, async () => {
    const { adapter, deliver, sendMessageToTarget } = fixture(outcome);
    await expect(
      adapter.send({ roomId: "channel", text: "hello" }),
    ).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
    expect(sendMessageToTarget).toHaveBeenCalledOnce();
  });
}
it("records confirmed multipart delivery with the final provider id", async () => {
  const { adapter, deliver } = fixture({
    kind: "delivered",
    receipt,
    memories: [],
  });
  await adapter.send({ roomId: "channel", text: "hello" });
  expect(deliver).toHaveBeenCalledWith(
    expect.anything(),
    "hello",
    expect.objectContaining({ metadata: { platformMessageId: "remote-2" } }),
  );
});
it("does not turn accepted sends with failed persistence into retryable success", async () => {
  const { adapter, deliver } = fixture({
    kind: "delivered",
    receipt: {
      ...receipt,
      persistence: {
        status: "failed",
        failures: [
          {
            providerMessageId: "remote-1",
            stage: "memory",
            code: "WRITE_FAILED",
            message: "storage unavailable",
          },
        ],
      },
    },
    memories: [],
  });
  await expect(
    adapter.send({ roomId: "channel", text: "hello" }),
  ).rejects.toThrow("do not retry blindly");
  expect(deliver).not.toHaveBeenCalled();
});
