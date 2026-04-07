import { describe, expect, it, mock } from "bun:test";
import type { IAgentRuntime } from "@elizaos/core";
import { ApprovalService } from "@elizaos/core";
import {
  bindNativeApprovals,
  forwardNativeApprovalSelection,
  requestNativeExecutionApproval,
} from "./native-bridge";

describe("execution approval native bridge", () => {
  it("binds the native approval service from runtime", () => {
    const approvals = {} as ApprovalService;
    const runtime = {
      getService: (serviceType: string) =>
        serviceType === ApprovalService.serviceType ? approvals : undefined,
    } as IAgentRuntime;

    expect(bindNativeApprovals(runtime)).toBe(approvals);
  });

  it("forwards native selection handling", async () => {
    const handleSelection = mock(async () => undefined);
    await forwardNativeApprovalSelection(
      { handleSelection } as unknown as ApprovalService,
      "approval-1",
      "approve",
    );

    expect(handleSelection).toHaveBeenCalledWith("approval-1", "approve");
  });

  it("requests native execution approval with mirrored callbacks", async () => {
    let requestInput:
      | {
          metadata: Record<string, unknown>;
          onSelect: (option: string) => Promise<void>;
          onTimeout: () => Promise<void>;
        }
      | undefined;
    const events: string[] = [];
    const approvals = {
      requestApprovalAsync: async (input: unknown) => {
        requestInput = input as typeof requestInput;
        return "native-task-1";
      },
    } as ApprovalService;

    const taskId = await requestNativeExecutionApproval({
      approvals,
      roomId: "runtime-room",
      entityId: "entity-1",
      platform: "telegram",
      userId: "user-1",
      roomIdLabel: "telegram:room-1:user-1:root",
      sessionKey: "telegram:room-1:user-1:root",
      command: "git push origin main",
      reason: "can rewrite git state or publish changes",
      ttlMinutes: 15,
      onApprove: () => {
        events.push("approve");
      },
      onDeny: () => {
        events.push("deny");
      },
      onTimeout: () => {
        events.push("timeout");
      },
    });

    expect(taskId).toBe("native-task-1");
    expect(requestInput?.metadata.platform).toBe("telegram");
    expect(requestInput?.metadata.command).toBe("git push origin main");

    await requestInput?.onSelect("approve");
    await requestInput?.onSelect("deny");
    await requestInput?.onTimeout();

    expect(events).toEqual(["approve", "deny", "timeout"]);
  });
});
