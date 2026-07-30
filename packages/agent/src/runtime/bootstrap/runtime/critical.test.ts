import { describe, expect, it } from "vitest";

import { validateCriticalRuntimeServices } from "./critical";

describe("bootstrap runtime services", () => {
  it("loads critical plugin services before probing the world rooms", async () => {
    const calls: string[] = [];
    const runtime = {
      agentId: "agent-123",
      async getServiceLoadPromise(name: string) {
        calls.push(`service:${name}`);
        return { name };
      },
      async getRooms(_worldId: string) {
        calls.push("rooms");
        return [];
      },
    };

    await validateCriticalRuntimeServices(runtime as never);

    expect(calls).toEqual([
      "service:rolodex",
      "service:doolittle_awareness",
      "service:doolittle_gateway",
      "service:doolittle_scheduler",
      "service:shell",
      "service:WORKFLOW_DISPATCH",
      "service:cron",
      "rooms",
    ]);
  });
});
