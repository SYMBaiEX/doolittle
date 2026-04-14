import { describe, expect, it } from "bun:test";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../../chat";
import { handleGatewayRuntimeOperationCommand } from "./operations";

function createInput(message: string): ChatTurnRequest {
  return {
    message,
    userId: "user-1",
    roomId: "discord:room-1:user-1:root",
    source: "discord",
  };
}

describe("gateway runtime command operations", () => {
  it("renders history and traces through the extracted operation router", async () => {
    const context = {
      gateway: {
        history: async () => ({
          deliveries: [
            {
              id: "delivery-1",
              text: "hello",
              target: {
                platform: "discord",
                channelId: "room-1",
                mode: "origin",
              },
            },
          ],
        }),
        trace: () => [
          {
            kind: "send",
            platform: "discord",
            detail: "delivered",
            traceId: "trace-1",
            sessionId: "session-1",
            deliveryId: "delivery-1",
          },
        ],
      },
    } as unknown as AgentExecutionContext;

    expect(
      await handleGatewayRuntimeOperationCommand(
        createInput("/gateway history"),
        "/gateway history",
        context,
      ),
    ).toContain("Latest delivery: delivery-1");
    expect(
      await handleGatewayRuntimeOperationCommand(
        createInput("/gateway trace"),
        "/gateway trace",
        context,
      ),
    ).toContain("trace-1");
  });
});
