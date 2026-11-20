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
