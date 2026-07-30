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
      "service:personality",
      "service:rolodex",
      "service:experience",
      "service:plugin_manager",
      "service:planning",
      "service:pairing",
      "service:memoryStorage",
      "service:eliza_knowledge_graph",
      "service:pdf",
      "service:doolittle_awareness",
      "service:doolittle_browser",
      "service:coding_agent",
      "service:ORCHESTRATOR_TASK_SERVICE",
      "service:AGENT_SKILLS_SERVICE",
      "service:doolittle_gateway",
      "service:doolittle_mcp",
      "service:doolittle_operator_planning",
      "service:doolittle_scheduler",
      "service:doolittle_shell",
      "service:WORKFLOW_DISPATCH",
      "service:cron",
      "rooms",
    ]);
  });
});
