import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import { describe, expect, it, vi } from "vitest";
import {
  BotConsultationBroker,
  effectivePermissions,
} from "./bot-consultation-broker";
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
  const bindConsultationConversation = vi.fn(async () => undefined);
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
    bindConsultationConversation,
    resolveVerifiedConversationWorkspace: vi.fn(async () => ({
      botId: "lead",
      sessionId: "origin-session",
      workspacePath: workspace,
    })),
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
  return {
    bots,
    input,
    lead,
    target,
    bindConversation,
    bindConsultationConversation,
    bindRun,
  };
}

describe("BotConsultationBroker", () => {
  it("does not resolve stale catalog roots for a verified per-chat scope", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-scope-"));
    const missing = resolve(directory, "removed-root");
    try {
      const origin = definition("lead", missing);
      const target = definition("target", missing);
      expect(
        effectivePermissions(origin, target, directory).workspacePaths,
      ).toEqual([directory]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each(["grant revoked", "team member removed"])(
    "rejects %s during delayed target activation before persisting or posting selected knowledge",
    async (reason) => {
      const directory = mkdtempSync(
        resolve(tmpdir(), "doolittle-broker-race-"),
      );
      try {
        const { bots, input, bindConversation } = fixture(directory);
        let authorized = true;
        const retrieveForConsultation = vi.fn(async () => [
          { id: "knowledge", title: "Finding", text: "Private promoted text" },
        ]);
        const assertConsultationAccess = vi.fn(() => {
          if (!authorized) throw new Error(reason);
        });
        Object.assign(bots, {
          knowledge: { retrieveForConsultation, assertConsultationAccess },
          backendFor: vi.fn(async (id: string) => {
            if (id === "target") {
              await Promise.resolve();
              authorized = false;
            }
            return {
              getState: () => ({
                phase: "ready",
                url: id === "target" ? "http://target" : "http://lead",
              }),
            };
          }),
        });
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
        await expect(
          broker.dispatch("default", { ...input, knowledgeIds: ["knowledge"] }),
        ).rejects.toThrow(reason);
        expect(retrieveForConsultation).toHaveBeenCalledOnce();
        expect(assertConsultationAccess).toHaveBeenCalledOnce();
        expect(bindConversation).not.toHaveBeenCalled();
        expect(broker.ledger.countRoot("root-run")).toBe(0);
        expect(runtimeFetch.mock.calls).toHaveLength(2);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
  it("dispatches once with durable ownership and reads the exact target transcript", async () => {
    const directory = mkdtempSync(resolve(tmpdir(), "doolittle-broker-"));
    try {
      const { bots, input, bindConsultationConversation, bindRun } =
        fixture(directory);
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
      expect(bindConsultationConversation).toHaveBeenCalledWith(
        "target",
        record.targetSessionId,
        expect.objectContaining({ workspacePath: directory }),
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

  it("does not bind or post when the origin run ends during target activation", async () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-broker-origin-race-"),
    );
    try {
      const { bots, input, bindConsultationConversation } = fixture(directory);
      let active = true;
      Object.assign(bots, {
        backendFor: vi.fn(async (id: string) => {
          if (id === "target") active = false;
          return {
            getState: () => ({
              phase: "ready",
              url: id === "target" ? "http://target" : "http://lead",
            }),
          };
        }),
      });
      const runtimeFetch = vi.fn(async () =>
        Response.json({
          run: {
            runId: "root-run",
            sessionId: "origin-session",
            status: active ? "acting" : "complete",
          },
        }),
      );
      const broker = new BotConsultationBroker(
        bots,
        directory,
        runtimeFetch as typeof fetch,
      );
      await expect(broker.dispatch("default", input)).rejects.toThrow(
        /no longer active/,
      );
      expect(bindConsultationConversation).not.toHaveBeenCalled();
      expect(broker.ledger.countRoot("root-run")).toBe(0);
      expect(runtimeFetch).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not grant a child scope after the target is stopped during activation", async () => {
    const directory = mkdtempSync(
      resolve(tmpdir(), "doolittle-broker-stop-race-"),
    );
    try {
      const { bots, input, bindConsultationConversation } = fixture(directory);
      let broker!: BotConsultationBroker;
      Object.assign(bots, {
        backendFor: vi.fn(async (id: string) => {
          if (id === "target") await broker.cancelForBot("target");
          return {
            getState: () => ({
              phase: "ready",
              url: id === "target" ? "http://target" : "http://lead",
            }),
          };
        }),
      });
      const runtimeFetch = vi.fn(async () =>
        Response.json({
          run: {
            runId: "root-run",
            sessionId: "origin-session",
            status: "acting",
          },
        }),
      );
      broker = new BotConsultationBroker(
        bots,
        directory,
        runtimeFetch as typeof fetch,
      );
      await expect(broker.dispatch("default", input)).rejects.toThrow(
        /cancelled during dispatch/,
      );
      expect(bindConsultationConversation).not.toHaveBeenCalled();
      expect(broker.ledger.countRoot("root-run")).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("uses the verified origin chat root instead of the target catalog workspace", async () => {
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
      // The target's long-lived profile does not grant this root. The host
      // creates a one-shot child scope from the active origin chat instead.
      await expect(broker.dispatch("default", input)).rejects.toThrow();
      expect(broker.ledger.forRoot("root-run")[0]?.workspacePath).toBe(
        directory,
      );
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
