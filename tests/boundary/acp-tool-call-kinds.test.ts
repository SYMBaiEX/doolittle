import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunSnapshot, RunUpdateEvent } from "@doolittle/contracts/run";
import { expect, it } from "vitest";
import { AcpProtocolRuntime } from "../../packages/agent/src/services/acp/protocol-runtime";
import type { AcpProtocolHost } from "../../packages/agent/src/services/acp/types";

const runtimeActions = [
  "READ",
  "EDIT",
  "SHELL",
  "WEB_FETCH",
  "SEARCH_FILES",
  "TASKS",
  "REPLY",
];

it("classifies ElizaOS runtime actions in ACP tool call updates", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-acp-tool-kinds-"));
  try {
    const runtime = new AcpProtocolRuntime(
      () => root,
      () => true,
      () => [],
      () => {},
    );
    runtime.bindHost({
      assertWorkspacePath: () => {},
      executeTurn: async ({ sessionId, onRunUpdate }) => {
        for (const [index, action] of runtimeActions.entries()) {
          const run = {
            runId: "run-1",
            observedActionCount: index + 1,
            activeAction: action,
            localMutations: [],
          } as unknown as RunSnapshot;
          const event: RunUpdateEvent = {
            type: "action-started",
            sessionId,
            run,
          };
          await onRunUpdate(event);
        }
      },
    } as Partial<AcpProtocolHost> as AcpProtocolHost);

    const { sessionId } = await runtime.newSession();
    const { updates } = await runtime.prompt({
      sessionId,
      prompt: [{ type: "text", text: "inspect the workspace" }],
    });

    const toolCalls = updates.flatMap(({ update }) =>
      update.sessionUpdate === "tool_call" ? [[update.title, update.kind]] : [],
    );
    expect(toolCalls).toEqual([
      ["READ", "read"],
      ["EDIT", "edit"],
      ["SHELL", "execute"],
      ["WEB_FETCH", "fetch"],
      ["SEARCH_FILES", "search"],
      ["TASKS", "think"],
      ["REPLY", "other"],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
