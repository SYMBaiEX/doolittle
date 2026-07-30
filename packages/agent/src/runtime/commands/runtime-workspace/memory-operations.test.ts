import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import {
  executeMemoryCommandOperation,
  parseMemoryCommand,
} from "./memory-operations";

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

describe("explicit memory commands", () => {
  it("parses product slash commands without owning model-action routing", () => {
    expect(
      parseMemoryCommand("/memory add user likes concise updates"),
    ).toEqual({
      action: "add",
      target: "user",
      content: "likes concise updates",
    });
    expect(parseMemoryCommand("/memory replace memory old => new")).toEqual({
      action: "replace",
      target: "memory",
      oldText: "old",
      content: "new",
    });
  });

  it("executes normalized commands through the product memory projection", () => {
    const services = memoryServices();
    expect(
      executeMemoryCommandOperation(services, {
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
});
