import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { BotDefinition } from "@doolittle/contracts/bots";
import type { UiTarget } from "@doolittle/contracts/ui-host";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UiExtensionHost,
  UiSubmissionRejectedError,
} from "./ui-extensions/host";
import {
  NativeUiBackend,
  nativeUiRunState,
  projectNativeUiEvent,
  type UiRuntimeRegistry,
} from "./ui-host-integration";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const target: UiTarget = { botId: "bot-1", sessionId: "session-1" };

function setup() {
  const root = mkdtempSync(resolve(tmpdir(), "doolittle-native-ui-"));
  roots.push(root);
  const bot: BotDefinition = {
    id: "bot-1",
    agentId: "agent-1",
    name: "One",
    persona: "One",
    isDefault: true,
    model: { provider: "openai-api", model: "test" },
    permissions: {
      connectionIds: [],
      workspacePaths: [root],
      toolIds: [],
      allowMutation: false,
      allowDelegation: false,
    },
    workspacePath: root,
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  };
  const owners = new Map([
    [
      target.sessionId,
      { ...target, createdAt: bot.createdAt, updatedAt: bot.updatedAt },
    ],
  ]);
  const runOwners = new Map<string, UiTarget & { runId: string }>();
  const runs = new Map<string, Record<string, unknown>>();
  const registry: UiRuntimeRegistry = {
    get: (id) => {
      if (id !== bot.id) throw new Error("Unknown bot.");
      return bot;
    },
    list: () => ({
      version: 1,
      defaultBotId: bot.id,
      bots: [{ ...bot, state: "ready", activeRunCount: 0 }],
    }),
    listConversations: () => [...owners.values()],
    bindConversation: (botId, sessionId, projectId) => {
      if (botId !== bot.id) throw new Error("Unknown bot.");
      const value = {
        botId,
        sessionId,
        ...(projectId ? { projectId } : {}),
        createdAt: bot.createdAt,
        updatedAt: bot.updatedAt,
      };
      owners.set(sessionId, value);
      return value;
    },
    assertConversationOwner: (botId, sessionId, projectId) => {
      const value = owners.get(sessionId);
      if (
        !value ||
        value.botId !== botId ||
        (projectId !== undefined && value.projectId !== projectId)
      )
        throw new Error("Owner conflict.");
      return value;
    },
    resolveSavedConversationOwner: (id) => owners.get(id) ?? null,
    bindRun: (botId, sessionId, runId) => {
      runOwners.set(runId, { botId, sessionId, runId });
    },
    assertRunOwner: async (botId, runId) => {
      if (runOwners.get(runId)?.botId !== botId)
        throw new Error("Run owner conflict.");
    },
    conversations: { getRun: (id) => runOwners.get(id) ?? null },
    backendFor: async () => ({
      getState: () => ({
        phase: "ready",
        message: "Ready",
        url: "http://runtime.local",
      }),
      getWorkspaceDirectory: () => root,
    }),
  };
  let status = 202;
  let transcript: unknown = {
    messages: [
      {
        id: "message-1",
        role: "user",
        content: "hello",
        createdAt: bot.createdAt,
      },
    ],
    hasEarlier: false,
  };
  let stream = "";
  const runtimeFetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/chat/runs" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          runId: string;
          roomId: string;
          message: string;
        };
        if (status >= 400)
          return Response.json({ error: "Rejected" }, { status });
        runs.set(body.runId, {
          runId: body.runId,
          sessionId: body.roomId,
          botId: bot.id,
          status: "thinking",
          message: body.message,
          pendingApprovals: 0,
        });
        return Response.json(
          { run_id: body.runId, room_id: body.roomId },
          { status },
        );
      }
      if (path.endsWith("/events"))
        return new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        });
      if (path === "/sessions/messages") return Response.json(transcript);
      if (path === "/sessions") return Response.json({ sessions: [] });
      if (path === "/chat/runs")
        return Response.json({ runs: [...runs.values()] });
      const runId = path.split("/").at(-1) ?? "";
      return runs.has(runId)
        ? Response.json({ run: runs.get(runId) })
        : Response.json({ error: "Not found" }, { status: 404 });
    },
  );
  const options = {
    registry,
    currentWorkspace: () => "/host/workspace",
    fetch: runtimeFetch as typeof fetch,
    pickAttachments: vi.fn(
      async (_target: UiTarget, assert: () => Promise<void>) => {
        await assert();
        return [];
      },
    ),
    commitAttachments: vi.fn(),
    openSurface: vi.fn(),
    presentApproval: vi.fn(async () => undefined),
  };
  const backend = new NativeUiBackend(options);
  const host = new UiExtensionHost(backend, resolve(root, "ui-host.json"));
  backend.attachHost(host);
  return {
    root,
    backend,
    host,
    registry,
    options,
    runtimeFetch,
    runOwners,
    runs,
    setStatus: (value: number) => {
      status = value;
    },
    setTranscript: (value: unknown) => {
      transcript = value;
    },
    setStream: (value: string) => {
      stream = value;
    },
  };
}

describe("canonical native UI integration", () => {
  it("requires the exact saved bot, session and project owner", async () => {
    const { backend } = setup();
    expect(await backend.ownsTarget(target)).toBe(true);
    expect(await backend.ownsTarget({ ...target, botId: "bot-2" })).toBe(false);
    expect(await backend.ownsTarget({ ...target, projectId: "foreign" })).toBe(
      false,
    );
    expect(await backend.ownsTarget({ ...target, sessionId: "unknown" })).toBe(
      false,
    );
  });

  it("submits one native run with its captured bot workspace and canonical ID", async () => {
    const { host, runtimeFetch, root, backend } = setup();
    const command = {
      type: "chat.send",
      target,
      submissionId: "stable",
      runId: "native-id",
      message: "hello",
    } as const;
    expect(await host.dispatch(command)).toMatchObject({
      accepted: true,
      runId: "native-id",
      target,
    });
    expect(await host.dispatch(command)).toMatchObject({
      accepted: true,
      runId: "native-id",
    });
    const posts = runtimeFetch.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]?.[1]?.body))).toMatchObject({
      botId: target.botId,
      roomId: target.sessionId,
      runId: "native-id",
      workspaceDir: root,
    });
    backend.dispose();
  });

  it("rechecks after all preparation and refuses POST on revoked authorization", async () => {
    const { backend, runtimeFetch } = setup();
    const denied = vi.fn(async () => {
      throw new Error("Grant was revoked.");
    });
    await expect(
      backend.sendChat({
        target,
        runId: "revoked",
        message: "hello",
        attachments: [],
        workspace: "/host/workspace",
        assertAuthorizedAtCommit: denied,
      }),
    ).rejects.toBeInstanceOf(UiSubmissionRejectedError);
    expect(denied).toHaveBeenCalledOnce();
    expect(
      runtimeFetch.mock.calls.some(([, init]) => init?.method === "POST"),
    ).toBe(false);
  });

  it("does not recover a definite HTTP rejection as an accepted run", async () => {
    const { host, backend, setStatus } = setup();
    setStatus(409);
    const command = {
      type: "chat.send",
      target,
      submissionId: "rejected",
      runId: "rejected",
      message: "hello",
    } as const;
    expect(await host.dispatch(command)).toMatchObject({
      accepted: false,
      error: "Runtime rejected the submission (409).",
    });
    expect(await host.dispatch(command)).toMatchObject({ accepted: false });
    backend.dispose();
  });

  it("requires acknowledged as-of transcript support and never guesses timestamp boundaries", async () => {
    const { backend, registry, setTranscript } = setup();
    registry.bindRun(target.botId, target.sessionId, "old-run");
    await expect(backend.readTranscript(target, "old-run")).rejects.toThrow(
      /not supported/u,
    );
    setTranscript({
      messages: [],
      hasEarlier: false,
      transcriptThroughRunId: "old-run",
    });
    expect(await backend.readTranscript(target, "old-run")).toEqual({
      messages: [],
      transcriptThroughRunId: "old-run",
    });
  });

  it("detaches an observer without calling the runtime cancellation endpoint", async () => {
    const { host, backend, runtimeFetch } = setup();
    await host.dispatch({
      type: "chat.send",
      target,
      submissionId: "durable",
      message: "hello",
    });
    backend.dispose();
    await Promise.resolve();
    expect(
      runtimeFetch.mock.calls.some(([url]) => String(url).endsWith("/cancel")),
    ).toBe(false);
  });

  it("publishes native SSE text and lifecycle from durable event IDs", async () => {
    const { host, backend, setStream } = setup();
    setStream(
      'event: response.created\ndata: {"event_id":1,"id":"response-1"}\n\nevent: response.output_text.delta\ndata: {"event_id":2,"id":"response-1","delta":"hello"}\n\nevent: response.completed\ndata: {"event_id":3,"id":"response-1"}\n\n',
    );
    const events: string[] = [];
    host.subscribe((event) => events.push(event.type));
    await host.dispatch({
      type: "chat.send",
      target,
      submissionId: "stream",
      runId: "stream",
      message: "hello",
    });
    await vi.waitFor(() =>
      expect(events).toEqual([
        "run.state",
        "message.delta",
        "message.completed",
        "run.state",
      ]),
    );
    backend.dispose();
  });

  it("maps attention/waiting separately and waits for the final response event to finish text", () => {
    expect(nativeUiRunState({ status: "waiting", pendingApprovals: 0 })).toBe(
      "waiting",
    );
    expect(nativeUiRunState({ status: "waiting", pendingApprovals: 1 })).toBe(
      "attention",
    );
    expect(
      projectNativeUiEvent(target, "run", "agent.run", {
        run: {
          runId: "run",
          sessionId: target.sessionId,
          status: "complete",
          pendingApprovals: 0,
        },
      }),
    ).toMatchObject([{ type: "custom", name: "doolittle.run.receipt" }]);
    expect(
      projectNativeUiEvent(target, "run", "response.cancelled", {}),
    ).toEqual([{ type: "run.state", target, runId: "run", state: "stopped" }]);
  });

  it("preserves non-streamed final text without duplicating already-streamed text", () => {
    const terminal = { id: "assistant", response: "Canonical answer" };
    expect(
      projectNativeUiEvent(
        target,
        "run",
        "response.completed",
        terminal,
        false,
      ),
    ).toMatchObject([
      { type: "message.delta", text: "Canonical answer" },
      { type: "message.completed" },
      { type: "run.state", state: "complete" },
    ]);
    expect(
      projectNativeUiEvent(target, "run", "response.completed", terminal, true),
    ).toMatchObject([
      {
        type: "custom",
        name: "doolittle.message.final",
        value: { text: "Canonical answer" },
      },
      { type: "message.completed" },
      { type: "run.state", state: "complete" },
    ]);
  });
});
