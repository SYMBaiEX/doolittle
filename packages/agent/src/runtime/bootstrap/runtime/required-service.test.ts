import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import { requireRuntimeService } from "./required-service";

describe("requireRuntimeService", () => {
  it("returns a registered service with the required methods", () => {
    const service = { start: () => undefined };
    const runtime = {
      getService: () => service,
    } as unknown as AgentRuntime;

    expect(
      requireRuntimeService<typeof service>(runtime, "example", ["start"]),
    ).toBe(service);
  });

  it("rejects a missing service", () => {
    const runtime = {
      getService: () => null,
    } as unknown as AgentRuntime;

    expect(() => requireRuntimeService(runtime, "example")).toThrow(
      "Required Eliza service example is unavailable.",
    );
  });

  it("rejects a service missing a required method", () => {
    const runtime = {
      getService: () => ({}),
    } as unknown as AgentRuntime;

    expect(() =>
      requireRuntimeService<{ start(): void }>(runtime, "example", ["start"]),
    ).toThrow("Required Eliza service example does not implement start().");
  });
});
