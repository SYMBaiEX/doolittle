import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import { getDefaultRepoRoot } from "@doolittle/agent/config/env/paths";
import { installSharedEngineHost } from "@doolittle/agent/runtime/engine/host";
import type { BackendState } from "../shared/contracts";
import { handleBotApiRequest } from "./bot-api";
import { BotProcessRegistry } from "./bot-process-registry";
import { EngineBotBackend } from "./engine-bot-backend";
import { EngineClient, type EngineTransport } from "./engine-client";
import { DesktopExecutionAdmission } from "./execution-admission";
import { isRecord } from "./ipc/input-validation";
import { readBoundedResponseText } from "./ipc/runtime-http";
import { RuntimeEndpoint } from "./runtime-endpoint";

type OwnedLead = {
  endpoint(): string | undefined;
  agentId: string;
  name: string;
  dataDir: string;
  workspace: string;
  bearerToken: string;
};

const BOT_MUTATION =
  /^\/bots\/(default|[0-9a-f-]{36})(?:\/(activate|stop|archive))?$/iu;
const VALID_FIELDS = new Set(["name", "persona", "avatar", "model"]);
const OFFLINE_MODEL = { provider: "offline", model: "offline" };

function enginePorts() {
  const dispatcher = new EventEmitter();
  let connected = true;
  class NativeEnginePort extends EventEmitter implements EngineTransport {
    get connected() {
      return connected;
    }
    send(message: unknown, callback?: (error: Error | null) => void) {
      if (!connected) {
        callback?.(new Error("The named bot engine is unavailable."));
        return false;
      }
      queueMicrotask(() => {
        if (connected) {
          dispatcher.emit("message", message);
          callback?.(null);
        } else {
          callback?.(new Error("The named bot engine disconnected."));
        }
      });
      return true;
    }
  }
  const transport = new NativeEnginePort();
  return {
    transport,
    ipc: {
      on(event: "message" | "disconnect", listener: (value: unknown) => void) {
        dispatcher.on(event, listener);
      },
      send(message: unknown) {
        queueMicrotask(() => {
          if (connected) transport.emit("message", message);
        });
        return connected;
      },
    },
    disconnect() {
      connected = false;
      dispatcher.emit("disconnect");
      transport.emit("disconnect");
    },
  };
}

class LeadEndpoint extends RuntimeEndpoint {
  constructor(
    private readonly lead: OwnedLead,
    private readonly engine: EngineClient,
    runtimeFetch: typeof fetch,
  ) {
    super(
      { phase: "booting", message: "Starting the lead bot…" },
      runtimeFetch,
    );
  }

  override getState(): BackendState {
    const url = this.lead.endpoint();
    if (!url) return super.getState();
    return {
      phase: "ready",
      url,
      agentId: this.lead.agentId,
      name: this.lead.name,
      message: "Lead bot ready",
    };
  }

  override start() {
    return Promise.resolve(this.getState());
  }

  override stop() {
    // The surrounding native API owns the lead through its lifetime pipe.
    return Promise.resolve();
  }

  override hasLiveRuntime() {
    return Boolean(this.lead.endpoint());
  }

  override getWorkspaceDirectory() {
    return this.lead.workspace;
  }

  getEngineClient() {
    return this.engine;
  }

  getRuntimeDataDirectory() {
    return this.lead.dataDir;
  }
}

function offlineBotBody(input: unknown, creating: boolean): string {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A bot request body is required.");
  const fields = input as Record<string, unknown>;
  if (
    Object.entries(fields).some(
      ([key, value]) =>
        !VALID_FIELDS.has(key) ||
        (key !== "model" && typeof value !== "string"),
    )
  ) {
    throw new Error(
      "Native bots use a private workspace without external permissions.",
    );
  }
  if (fields.model !== undefined) {
    const model = fields.model as Partial<typeof OFFLINE_MODEL> | null;
    if (
      model?.provider !== "offline" ||
      model.model !== "offline" ||
      Object.keys(model).some((key) => key !== "provider" && key !== "model")
    )
      throw new Error("Native named bots currently use the offline model.");
  }
  return JSON.stringify({
    ...fields,
    ...(creating ? { model: OFFLINE_MODEL } : {}),
  });
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const NAMED_CHAT_PATH =
  /^\/bots\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(\/sessions(?:\/messages)?|\/chat\/runs(?:\/((?:[A-Za-z0-9:_-]|%3[Aa]){1,128})(?:\/(events|cancel))?)?)$/u;
const CHAT_ID = /^[A-Za-z0-9:_-]{1,128}$/u;
const MAX_CHAT_BODY_BYTES = 256 * 1024;
const MAX_RECEIPT_BODY_BYTES = 2_000_000;
const EMPTY_MESSAGES = {
  messages: [],
  hasEarlier: false,
  nextOffset: 0,
  totalMessages: 0,
};

function privateOfflineBot(registry: BotProcessRegistry, id: string): boolean {
  try {
    const bot = registry.get(id);
    return (
      !bot.isDefault &&
      bot.model.provider === OFFLINE_MODEL.provider &&
      bot.model.model === OFFLINE_MODEL.model &&
      !bot.projectId &&
      !bot.permissions.allowMutation &&
      !bot.permissions.allowDelegation &&
      bot.permissions.connectionIds.length === 0 &&
      bot.permissions.toolIds.length === 0 &&
      bot.permissions.workspacePaths.length === 1 &&
      bot.permissions.workspacePaths[0] === bot.workspacePath &&
      bot.workspacePath === registry.privateBotWorkspace(id)
    );
  } catch {
    return false;
  }
}

function namedNotFound() {
  return Response.json(
    { error: "Named bot conversation or run not found." },
    { status: 404 },
  );
}

function boundedQuery(
  url: URL,
  allowed: Readonly<Record<string, readonly [number, number]>>,
) {
  const parsed = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (parsed.has(key)) return null;
    if (key === "sessionId" && "sessionId" in allowed) {
      if (!UUID.test(value)) return null;
    } else {
      const range = Object.hasOwn(allowed, key) ? allowed[key] : undefined;
      const number = Number(value);
      if (
        !range ||
        !/^\d{1,16}$/u.test(value) ||
        !Number.isSafeInteger(number) ||
        number < range[0] ||
        number > range[1]
      )
        return null;
    }
    parsed.set(key, value);
  }
  return parsed;
}

function ordinaryRunId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    CHAT_ID.test(id) &&
    !/^(?:automation|consult):/iu.test(id)
  );
}

async function workerJson(response: Response, signal: AbortSignal) {
  return JSON.parse(
    await readBoundedResponseText(response, MAX_RECEIPT_BODY_BYTES, signal),
  ) as unknown;
}

async function relayWorkerError(response: Response, signal: AbortSignal) {
  try {
    const payload = await workerJson(response, signal);
    if (isRecord(payload) && typeof payload.error === "string") {
      return Response.json(
        {
          error: payload.error.slice(0, 4_096),
          ...(typeof payload.code === "string"
            ? { code: payload.code.slice(0, 128) }
            : {}),
          ...(ordinaryRunId(payload.conflictingRunId)
            ? { conflictingRunId: payload.conflictingRunId }
            : {}),
        },
        { status: response.status },
      );
    }
  } catch {
    // A worker failure must never publish transport errors or internal headers.
  }
  return Response.json(
    { error: "The named worker could not complete this request." },
    { status: 502 },
  );
}

async function dispatchNamedChat(
  registry: BotProcessRegistry,
  runtimeFetch: typeof fetch,
  lead: OwnedLead,
  request: Request,
  url: URL,
): Promise<Response | null> {
  const match = NAMED_CHAT_PATH.exec(url.pathname);
  if (!match) return null;
  const [, botId, path, encodedRun, suffix] = match;
  const runId = encodedRun?.replace(/%3A/giu, ":");
  const method = request.method;
  const list = path === "/sessions";
  const history = path === "/sessions/messages";
  const submitting = path === "/chat/runs";
  const events = suffix === "events";
  const cancel = suffix === "cancel";
  if (
    method !== (submitting || cancel ? "POST" : "GET") ||
    url.hash ||
    (runId && !ordinaryRunId(runId))
  )
    return namedNotFound();
  if (!privateOfflineBot(registry, botId)) return namedNotFound();

  const query = boundedQuery(
    url,
    list
      ? { limit: [1, 200] }
      : history
        ? { sessionId: [0, 0], limit: [1, 500], offset: [0, 1_000_000_000] }
        : events
          ? { after: [0, Number.MAX_SAFE_INTEGER] }
          : {},
  );
  if (!query)
    return Response.json(
      { error: "Invalid named conversation query." },
      { status: 400 },
    );

  const scratch = registry.privateBotWorkspace(botId);
  const isOwned = (sessionId: string) => {
    const owner = registry.resolveSavedConversationOwner(sessionId);
    return (
      owner?.botId === botId &&
      !owner.projectId &&
      owner.workspacePath === scratch
    );
  };
  let sessionId = query.get("sessionId");
  let payload: Record<string, unknown> | undefined;
  let submissionId: string | undefined;
  if (submitting) {
    const body: unknown = await request.json().catch(() => null);
    if (
      !isRecord(body) ||
      Object.keys(body).some(
        (key) => !["roomId", "runId", "message", "source"].includes(key),
      ) ||
      (body.source !== undefined && body.source !== "native") ||
      typeof body.roomId !== "string" ||
      !UUID.test(body.roomId) ||
      !ordinaryRunId(body.runId) ||
      typeof body.message !== "string" ||
      Buffer.byteLength(body.message) > MAX_CHAT_BODY_BYTES ||
      !body.message.trim()
    ) {
      return Response.json(
        { error: "Invalid named chat request." },
        { status: 400 },
      );
    }
    const message = body.message.trim();
    if (
      message.startsWith("!") ||
      (message.startsWith("/") &&
        message !== "/help" &&
        message !== "/workspace tree")
    ) {
      return Response.json(
        { error: "This named client command is unavailable." },
        { status: 403 },
      );
    }
    sessionId = body.roomId;
    submissionId = body.runId;
    const existingRun = registry.conversations.getRun(submissionId);
    if (
      existingRun &&
      (existingRun.botId !== botId || existingRun.sessionId !== sessionId)
    )
      return namedNotFound();
    payload = {
      roomId: sessionId,
      runId: submissionId,
      message,
      userId: "local-user",
      source: "cli",
    };
  } else if (history && !sessionId) {
    return Response.json(
      { error: "Conversation ID is required." },
      { status: 400 },
    );
  }

  try {
    if (sessionId && !isOwned(sessionId)) {
      if (registry.resolveSavedConversationOwner(sessionId))
        return namedNotFound();
      if (!submitting) return Response.json(EMPTY_MESSAGES);
      const endpoint = lead.endpoint();
      if (!endpoint) return namedNotFound();
      const verifiedLead = await runtimeFetch(
        `${endpoint}/sessions/summary?sessionId=${encodeURIComponent(sessionId)}`,
        {
          signal: AbortSignal.any([
            request.signal,
            AbortSignal.timeout(10_000),
          ]),
        },
      );
      if (!verifiedLead.ok) throw new Error("Lead conversation check failed.");
      const summary = await workerJson(verifiedLead, request.signal);
      if (
        !isRecord(summary) ||
        !isRecord(summary.summary) ||
        summary.summary.sessionId !== sessionId ||
        summary.summary.messageCount !== 0 ||
        summary.summary.title ||
        summary.summary.projectId
      )
        return namedNotFound();
      registry.bindConversationWorkspace(botId, sessionId);
    }
    if (runId) {
      const owner = registry.conversations.getRun(runId);
      if (!owner || owner.botId !== botId || !isOwned(owner.sessionId))
        return namedNotFound();
      sessionId = owner.sessionId;
    }
    if (sessionId)
      await registry.resolveVerifiedConversationWorkspace(botId, sessionId);
    const backend = runId
      ? registry.readyBackendFor(botId)
      : await registry.backendFor(botId);
    const endpoint = backend?.getState().url;
    if (!endpoint)
      return Response.json(
        { error: "Start this named bot to access its saved runs." },
        { status: 409 },
      );
    if (submissionId && sessionId) {
      // Publish ownership first so a detached POST can still recover its exact
      // worker receipt. Reusing an ID for a different owner remains impossible.
      registry.bindRun(botId, sessionId, submissionId);
    }
    const workerPath = runId
      ? `/chat/runs/${encodeURIComponent(runId)}${suffix ? `/${suffix}` : ""}`
      : path;
    const target = new URL(workerPath, endpoint);
    target.search = query.toString();
    const signal = events
      ? request.signal
      : AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
    const upstream = await runtimeFetch(target, {
      method,
      headers: events
        ? { accept: "text/event-stream" }
        : payload
          ? { "content-type": "application/json" }
          : {},
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    });
    if (!upstream.ok) return relayWorkerError(upstream, signal);
    if (events) {
      const contentType = upstream.headers.get("content-type");
      if (
        !upstream.body ||
        contentType?.split(";", 1)[0] !== "text/event-stream"
      )
        return Response.json(
          { error: "Named worker returned invalid events." },
          { status: 502 },
        );
      return new Response(upstream.body, {
        headers: { "content-type": contentType, "cache-control": "no-cache" },
      });
    }
    const response = await workerJson(upstream, signal);
    if (!isRecord(response)) throw new Error("Invalid named worker response.");
    if (submitting) {
      if (
        upstream.status !== 202 ||
        response.bot_id !== botId ||
        response.run_id !== submissionId ||
        response.room_id !== sessionId ||
        typeof response.response_id !== "string" ||
        !UUID.test(response.response_id)
      )
        throw new Error("Named worker accepted the wrong chat run.");
      return Response.json(
        {
          ...response,
          events_url: `/bots/${botId}/chat/runs/${encodeURIComponent(submissionId as string)}/events`,
        },
        { status: 202 },
      );
    }
    if (runId) {
      const run = response.run;
      if (
        !isRecord(run) ||
        run.botId !== botId ||
        run.runId !== runId ||
        run.sessionId !== sessionId
      )
        throw new Error("Named worker returned a different run owner.");
    } else if (list) {
      if (!Array.isArray(response.sessions))
        throw new Error("Invalid named sessions.");
      return Response.json({
        sessions: response.sessions.filter(
          (row) =>
            isRecord(row) &&
            row.botId === botId &&
            typeof row.sessionId === "string" &&
            isOwned(row.sessionId),
        ),
      });
    } else if (history) {
      if (
        !Array.isArray(response.messages) ||
        response.messages.some(
          (row) => !isRecord(row) || row.sessionId !== sessionId,
        )
      )
        throw new Error("Named worker returned a different transcript owner.");
    }
    return Response.json(response, { status: upstream.status });
  } catch {
    return Response.json(
      { error: "The named bot request could not be completed." },
      { status: 502 },
    );
  }
}

export function createNativeBotHost(lead: OwnedLead) {
  const entry = process.argv[1];
  if (!entry) throw new Error("The bundled runtime entry is unavailable.");
  const ports = enginePorts();
  const host = installSharedEngineHost(pathToFileURL(entry), {
    enabled: true,
    ipc: ports.ipc,
  });
  if (!host) throw new Error("The named bot engine is unavailable.");
  const engine = new EngineClient(ports.transport);
  const owned = new Map<string, { backend: EngineBotBackend; token: string }>();
  const runtimeFetch: typeof fetch = (input, options) => {
    const url = new URL(input instanceof Request ? input.url : input);
    let token = url.origin === lead.endpoint() ? lead.bearerToken : undefined;
    if (!token) {
      token = [...owned.values()].find(
        ({ backend }) => backend.getState().url === url.origin,
      )?.token;
    }
    if (
      !token ||
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.username ||
      url.password
    ) {
      throw new Error("The requested bot runtime is unavailable.");
    }
    const headers = new Headers(
      input instanceof Request ? input.headers : undefined,
    );
    new Headers(options?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.set("authorization", `Bearer ${token}`);
    return fetch(input, { ...options, headers, redirect: "error" });
  };
  const repoRoot = getDefaultRepoRoot();
  const registry = new BotProcessRegistry(
    { executable: process.execPath, args: [entry, "api"], repoRoot },
    lead.dataDir,
    new LeadEndpoint(lead, engine, runtimeFetch),
    lead.workspace,
    {
      admission: new DesktopExecutionAdmission(),
      runtimeFetch,
      createBackend(target, dataDir, workspace, workerFetch, options) {
        const botId = options.expectedBotId;
        if (!botId) throw new Error("Named bot identity is unavailable.");
        const token = randomBytes(32).toString("hex");
        const backend = new EngineBotBackend(
          target.repoRoot,
          dataDir,
          workspace,
          workerFetch,
          {
            ...options,
            isolatedEnvironment: {
              ...options.isolatedEnvironment,
              ELIZA_REQUIRE_LOCAL_AUTH: "1",
              ELIZA_API_TOKEN: token,
            },
          },
          () => engine,
        );
        const unsubscribe = backend.subscribe((state) => {
          if (state.phase === "stopped") {
            if (owned.get(botId)?.backend === backend) owned.delete(botId);
            unsubscribe();
          }
        });
        owned.set(botId, { backend, token });
        return backend;
      },
    },
  );
  let closing = false;
  return {
    async dispatch(request: Request, url: URL): Promise<Response | null> {
      if (closing)
        return Response.json(
          { error: "The bot host is stopping." },
          { status: 503 },
        );
      const chat = await dispatchNamedChat(
        registry,
        runtimeFetch,
        lead,
        request,
        url,
      );
      if (chat) return chat;
      const { method } = request;
      const mutation = BOT_MUTATION.exec(url.pathname);
      const catalog =
        url.pathname === "/bots" && (method === "GET" || method === "POST");
      if (
        !catalog &&
        !(
          mutation &&
          (method === "PATCH" ? !mutation[2] : method === "POST" && mutation[2])
        )
      )
        return null;
      if (url.search || url.hash)
        return Response.json({ error: "Invalid bot route." }, { status: 400 });
      if (
        mutation?.[2] === "activate" &&
        mutation[1] !== "default" &&
        mutation[1] !== lead.agentId &&
        !privateOfflineBot(registry, mutation[1])
      )
        return namedNotFound();
      let body: string | undefined;
      if ((catalog && method === "POST") || method === "PATCH") {
        try {
          body = offlineBotBody(await request.json(), catalog);
        } catch (error) {
          return Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Invalid bot configuration.",
            },
            { status: 400 },
          );
        }
      }
      const result = await handleBotApiRequest(registry, {
        requestId: randomUUID(),
        method: method as "GET" | "POST" | "PATCH",
        path: url.pathname,
        headers: {},
        body,
      });
      return (
        result &&
        new Response(result.body, {
          status: result.status,
          headers: result.headers,
        })
      );
    },
    async close() {
      if (closing) return;
      closing = true;
      try {
        await registry.stopAll();
      } finally {
        try {
          await host.stopAll();
        } finally {
          engine.dispose();
          ports.disconnect();
        }
      }
    },
  };
}
