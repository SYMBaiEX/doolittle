import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import { describe, expect, it, vi } from "vitest";
import { BotConsultationBroker } from "./bot-consultation-broker";
import type { BotProcessRegistry } from "./bot-process-registry";

function definition(id: string, workspace: string): BotDefinition {
  return {
    id,
    agentId: id === "lead" ? "lead" : "target-agent",
    name: id,
    persona: "Test",
    model: { provider: "offline", model: "offline" },
    permissions: {
      connectionIds: [],
      workspacePaths: [workspace],
      toolIds: [],
      allowMutation: false,
      allowDelegation: id === "lead",
    },
    workspacePath: workspace,
    isDefault: id === "lead",
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  };
}

function fixture(workspace: string) {
  const lead = definition("lead", workspace);
  const target = definition("target", workspace);
  const bindConversation = vi.fn();
  const bindRun = vi.fn();
  const bots = {
    get: (id: string) => (id === "default" || id === "lead" ? lead : target),
    assertConversationOwner: vi.fn(),
    assertRunOwner: vi.fn(async () => undefined),
    conversations: {
      getRun: () => ({
        botId: "lead",
        sessionId: "origin-session",
        projectId: undefined,
      }),
    },
    backendFor: vi.fn(async (id: string) => ({
      getState: () => ({
        phase: "ready",
        url: id === "target" ? "http://target" : "http://lead",
      }),
    })),
    list: () => ({ bots: [lead, target] }),
    bindConversation,
    bindRun,
  } as unknown as BotProcessRegistry;
  const input = {
    origin: {
      botId: "lead",
      agentId: "lead",
      sessionId: "origin-session",
      runId: "root-run",
    },
    targetBotId: "target",
    objective: "Summarize the result",
    context: [],
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
  return { bots, input, lead, target, bindConversation, bindRun };
}

describe("BotConsultationBroker", () => {
  it("dispatches once with durable ownership and reads the exact target transcript", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-broker-"));
    try {
      const { bots, input, bindConversation, bindRun } = fixture(directory);
      let targetRun = "";
      const runtimeFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const path = String(url);
          if (path === "http://lead/chat/runs/root-run") {
            return Response.json({
              run: {
                runId: "root-run",
                sessionId: "origin-session",
                status: "acting",
              },
            });
          }
          if (path === "http://target/chat/runs" && init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            expect(body.source).toBe("desktop-consultation");
            targetRun = body.runId;
            return Response.json(
              { run_id: body.runId, room_id: body.roomId },
              { status: 202 },
            );
          }
          if (
            path === `http://target/chat/runs/${encodeURIComponent(targetRun)}`
          ) {
            return Response.json({
              run: {
                runId: targetRun,
                sessionId: targetRun,
                status: "complete",
              },
            });
          }
          if (path.startsWith("http://target/sessions/messages?")) {
            expect(path).toContain(
              `throughRunId=${encodeURIComponent(targetRun)}`,
            );
            return Response.json({
              messages: [{ role: "assistant", text: "Exact answer" }],
              throughRunId: targetRun,
            });
          }
          throw new Error(`Unexpected request ${path}`);
        },
      );
      const broker = new BotConsultationBroker(
        bots,
        directory,
        runtimeFetch as typeof fetch,
      );
      const record = await broker.dispatch("default", input);
      expect(record.status).toBe("accepted");
      expect(bindConversation).toHaveBeenCalledWith(
        "target",
        record.targetSessionId,
        undefined,
      );
      expect(bindRun).toHaveBeenCalledWith(
        "target",
        record.targetSessionId,
        record.targetRunId,
      );
      expect(broker.ledger.get(record.dispatchId)?.status).toBe("accepted");
      const result = await broker.wait("default", record.dispatchId);
      expect(result).toMatchObject({
        outcome: "complete",
        text: "Exact answer",
        owner: { botId: "target", runId: targetRun },
      });
      expect(
        new BotConsultationBroker(
          bots,
          directory,
          runtimeFetch as typeof fetch,
        ).ledger.get(record.dispatchId)?.result?.text,
      ).toBe("Exact answer");
      expect(
        runtimeFetch.mock.calls.filter(
          ([url]) => String(url) === "http://target/chat/runs",
        ),
      ).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("denies an ungranted workspace before creating a dispatch or calling the target", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-broker-"));
    const other = mkdtempSync(resolve(tmpdir(), "doolittle-broker-other-"));
    try {
      const { bots, input, target } = fixture(directory);
      target.permissions.workspacePaths = [other];
      const runtimeFetch = vi.fn(async () =>
        Response.json({
          run: {
            runId: "root-run",
            sessionId: "origin-session",
            status: "acting",
          },
        }),
      );
      const broker = new BotConsultationBroker(
        bots,
        directory,
        runtimeFetch as typeof fetch,
      );
      await expect(broker.dispatch("default", input)).rejects.toThrow(
        /workspace paths/iu,
      );
      expect(broker.ledger.countRoot("root-run")).toBe(0);
      expect(runtimeFetch).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("cancels a pending child before its target bot stops, without replaying dispatch", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-broker-"));
    try {
      const { bots, input } = fixture(directory);
      let cancelCount = 0;
      const runtimeFetch = vi.fn(
        async (url: string | URL | Request, init?: RequestInit) => {
          const path = String(url);
          if (path === "http://lead/chat/runs/root-run") {
            return Response.json({
              run: {
                runId: "root-run",
                sessionId: "origin-session",
                status: "acting",
              },
            });
          }
          if (path === "http://target/chat/runs" && init?.method === "POST") {
            const body = JSON.parse(String(init.body));
            return Response.json(
              { run_id: body.runId, room_id: body.roomId },
              { status: 202 },
            );
          }
          if (path.endsWith("/cancel") && init?.method === "POST") {
            cancelCount++;
            return Response.json({ cancelled: true });
          }
          throw new Error(`Unexpected request ${path}`);
        },
      );
      const broker = new BotConsultationBroker(
        bots,
        directory,
        runtimeFetch as typeof fetch,
      );
      const record = await broker.dispatch("default", input);
      await broker.cancelForBot("target");
      await broker.cancelAll();
      expect(cancelCount).toBe(1);
      expect(broker.ledger.get(record.dispatchId)?.status).toBe("cancelled");
      expect(
        runtimeFetch.mock.calls.filter(
          ([url]) => String(url) === "http://target/chat/runs",
        ),
      ).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
