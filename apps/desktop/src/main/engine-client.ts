import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  SHARED_ENGINE_START_CONTROL_TIMEOUT_MS,
  SHARED_ENGINE_STOP_CONTROL_TIMEOUT_MS,
} from "@doolittle/contracts/engine";
import {
  attachWorkerHostRpc,
  type WorkerHostHandler,
  type WorkerHostRpcOptions,
} from "./worker-host-rpc";

const CONTROL_PROTOCOL = "doolittle-engine-v1";
const HOST_PROTOCOL = "doolittle-engine-host-v1";
const WORKER_PROTOCOL = "doolittle-worker-host-v1";
const BOT_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/u;
const LOOPBACK_URL = /^http:\/\/127\.0\.0\.1:(?:[1-9][0-9]{0,4})$/u;

export interface EngineReady {
  url: string;
  agentId: string;
  name: string;
  botId: string;
}

type Pending = {
  botId: string;
  operation: "start" | "stop" | "stop-all";
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type HostBinding = {
  virtualChild: VirtualWorkerChild;
  detach: () => void;
  onDisconnect: () => void;
  stopPromise?: Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validReady(
  value: unknown,
  botId: string,
  agentId?: string,
): value is EngineReady {
  if (
    !isRecord(value) ||
    value.botId !== botId ||
    typeof value.url !== "string" ||
    !LOOPBACK_URL.test(value.url) ||
    typeof value.agentId !== "string" ||
    (agentId !== undefined && value.agentId !== agentId) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    value.name.length > 256
  )
    return false;
  const port = Number(value.url.slice(value.url.lastIndexOf(":") + 1));
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

/** A bot-local IPC surface for the existing host RPC guard and pending limit. */
class VirtualWorkerChild extends EventEmitter {
  connected = true;

  constructor(
    private readonly engine: ChildProcess,
    private readonly botId: string,
  ) {
    super();
  }

  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    if (!this.connected || !this.engine.connected) {
      callback?.(new Error("The shared Doolittle engine is unavailable."));
      return false;
    }
    try {
      // `false` means backpressure, not failed delivery. The callback is the
      // authoritative send result for immediate receipt rollback.
      return this.engine.send(
        { protocol: HOST_PROTOCOL, botId: this.botId, message },
        callback,
      );
    } catch {
      callback?.(new Error("The shared Doolittle engine is unavailable."));
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
    this.removeAllListeners();
  }
}

/** Multiplexes named worker controls over the existing lead child IPC. */
export class EngineClient {
  private readonly pending = new Map<string, Pending>();
  private readonly hosts = new Map<string, HostBinding>();
  private disconnected = false;

  constructor(
    private readonly child: ChildProcess,
    private readonly timeoutMs = SHARED_ENGINE_STOP_CONTROL_TIMEOUT_MS,
  ) {
    child.on("message", this.onMessage);
    child.once("disconnect", this.onDisconnect);
    child.once("exit", this.onDisconnect);
    child.once("error", this.onDisconnect);
    if (!child.connected) this.onDisconnect();
  }

  async startBot(
    botId: string,
    environment: Record<string, string>,
    expectedAgentId: string,
    hostHandler: WorkerHostHandler,
    onDisconnect: () => void,
    onAbandonedResult?: WorkerHostRpcOptions["onAbandonedResult"],
  ): Promise<EngineReady> {
    if (this.disconnected || !this.child.connected)
      throw new Error("The shared Doolittle engine is unavailable.");
    if (!BOT_ID.test(botId) || !expectedAgentId || this.hosts.has(botId))
      throw new Error("Named bot engine request is invalid.");
    const virtualChild = new VirtualWorkerChild(this.child, botId);
    const detach = attachWorkerHostRpc(
      virtualChild as unknown as Parameters<typeof attachWorkerHostRpc>[0],
      botId,
      hostHandler,
      { onAbandonedResult },
    );
    const binding = { virtualChild, detach, onDisconnect };
    this.hosts.set(botId, binding);
    try {
      return (await this.control(
        "start",
        botId,
        environment,
        expectedAgentId,
      )) as EngineReady;
    } catch (error) {
      if (this.hosts.get(botId) === binding) {
        if (this.disconnected || !this.child.connected) {
          this.releaseHost(botId, true);
        } else {
          try {
            await this.stopBot(botId);
          } catch {
            if (this.disconnected || !this.child.connected)
              this.releaseHost(botId, true);
            throw new Error(
              "Named bot startup failed and its worker stop was not confirmed.",
            );
          }
        }
      }
      throw error;
    }
  }

  hasBot(botId: string): boolean {
    return this.hosts.has(botId);
  }

  async stopBot(botId: string): Promise<void> {
    const binding = this.hosts.get(botId);
    if (binding?.stopPromise) return binding.stopPromise;
    const stopping = this.control("stop", botId).then(() => {
      if (binding && this.hosts.get(botId) === binding) {
        this.releaseHost(botId, false);
        this.cancelPendingStart(botId);
      }
    });
    if (binding) binding.stopPromise = stopping;
    try {
      await stopping;
    } finally {
      if (binding?.stopPromise === stopping) binding.stopPromise = undefined;
    }
  }

  /** Confirm the entire named-worker fleet has stopped, then revoke its RPC bindings. */
  async stopAll(): Promise<void> {
    const bindings = [...this.hosts.entries()];
    await this.control("stop-all", "default");
    for (const [botId, binding] of bindings) {
      if (this.hosts.get(botId) !== binding) continue;
      this.releaseHost(botId, true);
      this.cancelPendingStart(botId);
    }
  }

  dispose(): void {
    this.onDisconnect();
  }

  private control(
    operation: "start" | "stop" | "stop-all",
    botId: string,
    environment?: Record<string, string>,
    expectedAgentId?: string,
  ): Promise<EngineReady | undefined> {
    if (this.disconnected || !this.child.connected)
      return Promise.reject(
        new Error("The shared Doolittle engine is unavailable."),
      );
    if (!BOT_ID.test(botId))
      return Promise.reject(new Error("Named bot identity is invalid."));
    const id = randomUUID();
    return new Promise<EngineReady | undefined>((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(new Error("The named bot engine did not respond in time."));
        },
        operation === "start"
          ? SHARED_ENGINE_START_CONTROL_TIMEOUT_MS
          : this.timeoutMs,
      );
      this.pending.set(id, {
        botId,
        operation,
        resolve: (result) => {
          if (
            operation === "start" &&
            !validReady(result, botId, expectedAgentId)
          ) {
            reject(
              new Error("The named bot engine returned a different identity."),
            );
            return;
          }
          resolve(result as EngineReady | undefined);
        },
        reject,
        timer,
      });
      try {
        this.child.send(
          {
            protocol: CONTROL_PROTOCOL,
            id,
            operation,
            botId,
            ...(operation === "start" ? { environment } : {}),
          },
          (error) => {
            if (error) this.rejectPending(id);
          },
        );
      } catch {
        this.rejectPending(id);
      }
    });
  }

  private rejectPending(id: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);
    pending.reject(new Error("The shared Doolittle engine is unavailable."));
  }

  private cancelPendingStart(botId: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.botId !== botId || pending.operation !== "start") continue;
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(new Error("The named bot engine stopped before ready."));
    }
  }

  private readonly onMessage = (value: unknown): void => {
    if (this.disconnected || !isRecord(value)) return;
    if (
      value.protocol === CONTROL_PROTOCOL &&
      value.event === "bot-exit" &&
      typeof value.botId === "string"
    ) {
      this.releaseHost(value.botId, true);
      return;
    }
    if (value.protocol === CONTROL_PROTOCOL && typeof value.id === "string") {
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      clearTimeout(pending.timer);
      if (value.ok !== true) {
        pending.reject(
          new Error("The named bot engine could not complete the request."),
        );
      } else {
        pending.resolve(value.result);
      }
      return;
    }
    if (
      value.protocol !== HOST_PROTOCOL ||
      typeof value.botId !== "string" ||
      !isRecord(value.message) ||
      value.message.protocol !== WORKER_PROTOCOL ||
      value.message.botId !== value.botId
    )
      return;
    this.hosts.get(value.botId)?.virtualChild.emit("message", value.message);
  };

  private releaseHost(botId: string, notify: boolean): void {
    const binding = this.hosts.get(botId);
    if (!binding) return;
    this.hosts.delete(botId);
    binding.detach();
    binding.virtualChild.disconnect();
    if (notify) binding.onDisconnect();
  }

  private readonly onDisconnect = (): void => {
    if (this.disconnected) return;
    this.disconnected = true;
    this.child.removeListener("message", this.onMessage);
    this.child.removeListener("disconnect", this.onDisconnect);
    this.child.removeListener("exit", this.onDisconnect);
    this.child.removeListener("error", this.onDisconnect);
    for (const id of this.pending.keys()) this.rejectPending(id);
    for (const botId of this.hosts.keys()) this.releaseHost(botId, true);
  };
}
