import { describe, expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../chat";
import { handleRuntimeWorkspaceIoCommand } from "./workspace";

describe("runtime workspace commands", () => {
  it("routes memory mutations through the shared normalized operation", async () => {
    const add = vi.fn(() => "memory added");
    const context = {
      services: {
        memory: {
          add,
          replace: vi.fn(),
          remove: vi.fn(),
          renderSnapshot: vi.fn(),
        },
      },
    } as unknown as AgentExecutionContext;

    await expect(
      handleRuntimeWorkspaceIoCommand(
        { userId: "owner", message: "/memory add user prefers Nub" },
        "/memory add user prefers Nub",
        context,
      ),
    ).resolves.toBe("memory added");
    expect(add).toHaveBeenCalledWith("user", "prefers Nub", "owner");
  });
});
