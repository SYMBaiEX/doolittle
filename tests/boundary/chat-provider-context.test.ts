import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { createAgentContextProviders } from "../../packages/agent/src/providers/agent-context";
import { emitPostProviderNotices } from "../../packages/agent/src/runtime/chat-turn/post-provider/finalize";
import {
  AGENT_SKILLS_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "../../packages/agent/src/runtime/native/service-bridge/runtime-contracts";
import type { AppServices } from "../../packages/agent/src/services";

it("starts the bounded workspace summary while repository status is pending", async () => {
  let finishStatus = (_status: string) => {};
  const status = new Promise<string>((resolve) => {
    finishStatus = resolve;
  });
  const recentBySession = vi.fn(() => []);
  const summaryAsync = vi.fn(async () => "src/index.ts");
  const services = {
    contextFiles: { render: () => "" },
    skills: { list: () => [] },
    repository: { status: () => status },
    runController: {},
    sessions: { recentBySession },
    workspace: { summaryAsync },
  } as unknown as AppServices;
  const runtime = {
    getService: (id: string) => {
      if (id === AGENT_SKILLS_SERVICE) return {};
      if (id === DOOLITTLE_SHELL_SERVICE) return { history: () => [] };
      return null;
    },
  } as unknown as IAgentRuntime;
  const provider = createAgentContextProviders(services).find(
    (candidate) => candidate.name === "DOOLITTLE_WORKSPACE_CONTEXT_PROVIDER",
  );
  expect(provider).toBeDefined();
  const result = provider?.get(
    runtime,
    { content: { text: "Explain this workspace" } } as Memory,
    {} as State,
  );
  try {
    expect(summaryAsync).toHaveBeenCalledExactlyOnceWith(16);
  } finally {
    finishStatus("working tree clean");
  }
  expect((await result)?.text).toContain("working tree clean");
  expect((await result)?.text).toContain("src/index.ts");
  expect(recentBySession).not.toHaveBeenCalled();
});

it("does not query transcript notices for runs without a notice sink", async () => {
  const readTranscript = vi.fn();
  const countBySessionRole = vi.fn();
  const input = {
    input: { source: "cli" },
    context: {
      services: {
        contextCompression: {},
        sessions: { recentBySession: readTranscript, countBySessionRole },
      },
    },
    turn: { sessionId: "interactive", localInteractive: true },
  } as unknown as Parameters<typeof emitPostProviderNotices>[0];
  await emitPostProviderNotices(input);
  expect(readTranscript).not.toHaveBeenCalled();
  expect(countBySessionRole).not.toHaveBeenCalled();
});
