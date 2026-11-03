import type { AgentRuntime, IAgentRuntime } from "@elizaos/core";
import type { OwnedAcpProtocolHost } from "../../services/acp/host";
import type { EnvConfig } from "../../types/runtime/index";
import { buildAppContext } from "../bootstrap/app-context";
import { AppContextManager } from "../bootstrap/app-context-manager";
import { disposeRuntime } from "../bootstrap/runtime/initialization";
import type { AppContext, AppContextOptions } from "../bootstrap/types";
import { createApplicationAcpHost } from "./acp-host";
import {
  type ApplicationServiceGraph,
  createApplicationServiceGraph,
} from "./service-graph";

export type ApplicationSessionPhase =
  | "idle"
  | "activating"
  | "ready"
  | "degraded"
  | "failed"
  | "disposing"
  | "disposed";

/** Owns one profile's service graph and its lazy SDK runtime for this process. */
export class ApplicationSession {
  private graph?: ApplicationServiceGraph;
  private acpHost?: OwnedAcpProtocolHost;
  private readonly contextManager: AppContextManager;
  private readonly shutdownController = new AbortController();
  private readonly activationRequests = new Set<Promise<AppContext>>();
  private ownedRuntime?: AgentRuntime;
  private activationFailure?: { error: unknown };
  private disposalRequested = false;
  private disposalPromise?: Promise<void>;
  private currentPhase: ApplicationSessionPhase = "idle";

  constructor(private readonly configuration?: EnvConfig) {
    this.contextManager = new AppContextManager(async (options) => {
      this.currentPhase = "activating";
      try {
        return await buildAppContext(options, this.serviceGraph(), {
          acquired: (runtime) => {
            this.ownedRuntime = runtime;
          },
          released: (runtime) => {
            if (this.ownedRuntime === runtime) this.ownedRuntime = undefined;
          },
        });
      } catch (error) {
        // An incomplete rollback retains its owner and blocks replacement.
        if (this.ownedRuntime) this.activationFailure = { error };
        if (!this.disposalRequested) this.currentPhase = "failed";
        throw error;
      }
    });
  }

  get phase(): ApplicationSessionPhase {
    return this.currentPhase;
  }

  get config(): EnvConfig {
    return this.serviceGraph().config;
  }

  get services(): ApplicationServiceGraph["services"] {
    return this.serviceGraph().services;
  }

  get workerBotId(): string | undefined {
    return this.serviceGraph().workerBot?.id;
  }

  ownsRuntime(runtime: IAgentRuntime | null | undefined): boolean {
    return runtime != null && this.ownedRuntime === runtime;
  }

  get shutdownSignal(): AbortSignal {
    return this.shutdownController.signal;
  }

  ensureRuntime(options: AppContextOptions = {}): Promise<AppContext> {
    if (this.disposalRequested) {
      return Promise.reject(
        new Error("The application session is closing or closed."),
      );
    }
    if (this.activationFailure) {
      return Promise.reject(this.activationFailure.error);
    }
    const request = this.contextManager.get(options).then(
      (context) => {
        if (this.disposalRequested) {
          throw new Error(
            "The application session closed during runtime activation.",
          );
        }
        this.currentPhase = "ready";
        return context;
      },
      (error) => {
        if (this.contextManager.current() && !this.disposalRequested) {
          this.currentPhase = "degraded";
        }
        throw error;
      },
    );
    this.activationRequests.add(request);
    void request.then(
      () => this.activationRequests.delete(request),
      () => this.activationRequests.delete(request),
    );
    return request;
  }

  /** Drain activation and retain any failed teardown so disposal can retry. */
  dispose(
    reason = "Doolittle application shutdown",
    options: { fast?: boolean } = {},
  ): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    if (this.currentPhase === "disposed") return Promise.resolve();
    this.disposalRequested = true;
    this.currentPhase = "disposing";
    this.shutdownController.abort(new Error(reason));
    this.graph?.services.acp.cancelAllProtocolSessions();
    const attempt = (async () => {
      await Promise.allSettled([...this.activationRequests]);
      const errors: unknown[] = [];
      try {
        await this.acpHost?.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (this.ownedRuntime) {
        const runtime = this.ownedRuntime;
        try {
          await disposeRuntime(runtime, reason, undefined, options);
          this.ownedRuntime = undefined;
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Application shutdown is incomplete.");
      }
      this.contextManager.reset();
      this.acpHost = undefined;
      this.graph = undefined;
      this.currentPhase = "disposed";
    })();
    this.disposalPromise = attempt;
    void attempt.catch(() => {
      if (this.disposalPromise === attempt) {
        this.disposalPromise = undefined;
        this.currentPhase = "failed";
      }
    });
    return attempt;
  }

  private serviceGraph(): ApplicationServiceGraph {
    if (this.disposalRequested) {
      throw new Error("The application session is closing or closed.");
    }
    if (!this.graph) {
      this.graph = createApplicationServiceGraph(this.configuration);
      this.acpHost = createApplicationAcpHost(this);
      this.graph.services.acp.bindProtocolHost(this.acpHost);
    }
    return this.graph;
  }
}
