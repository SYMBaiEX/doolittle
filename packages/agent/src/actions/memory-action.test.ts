import type { Memory } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import {
  createMemoryAction,
  executeMemoryOperation,
  parseMemoryCommand,
  resolveMemoryOperationFromParams,
} from "./memory-action";

function message(text: string, userId?: string): Memory {
  return {
    content: { text },
    metadata: userId ? { doolittle: { userId } } : undefined,
  } as Memory;
}

function memoryServices() {
  return {
    memory: {
      renderSnapshot: vi.fn(() => "memory snapshot"),
      add: vi.fn(() => "memory added"),
      replace: vi.fn(() => "memory replaced"),
      remove: vi.fn(() => "memory removed"),
    },
  } as unknown as AppServices;
}

describe("memory action", () => {
  it("normalizes slash commands and planner parameters into one operation", () => {
    expect(
      parseMemoryCommand("/memory add user likes concise updates"),
    ).toEqual({
      action: "add",
      target: "user",
      content: "likes concise updates",
    });
    expect(
      resolveMemoryOperationFromParams({
        action: "replace",
        target: "memory",
        oldText: "old",
        content: "new",
      }),
    ).toEqual({
      action: "replace",
      target: "memory",
      oldText: "old",
      content: "new",
    });
  });

  it("executes normalized operations through the memory service", () => {
    const services = memoryServices();
    expect(
      executeMemoryOperation(services, {
        action: "remove",
        target: "user",
        oldText: "obsolete",
      }),
    ).toBe("memory removed");
    expect(services.memory.remove).toHaveBeenCalledWith(
      "user",
      "obsolete",
      undefined,
    );
  });

  it("is planner-selectable and prefers structured parameters", async () => {
    const services = memoryServices();
    const action = createMemoryAction(services);

    await expect(
      action.validate({} as never, message("Remember that I use Nub.")),
    ).resolves.toBe(true);
    const result = await action.handler(
      {} as never,
      message("Remember that I use Nub.", "alice"),
      undefined,
      {
        parameters: {
          action: "add",
          target: "user",
          content: "Uses Nub for package scripts.",
        },
      },
    );

    expect(services.memory.add).toHaveBeenCalledWith(
      "user",
      "Uses Nub for package scripts.",
      "alice",
    );
    expect(result).toMatchObject({
      success: true,
      verifiedUserFacing: true,
      data: { action: "add", target: "user" },
    });
  });
});
