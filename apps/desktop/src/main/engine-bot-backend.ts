import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { BackendState } from "../shared/contracts";
import {
  type BackendLaunchTarget,
  BackendManager,
  type BackendManagerOptions,
  buildBackendEnvironment,
} from "./backend";
import type { EngineClient } from "./engine-client";
import { runtimeStartsAllowed } from "./runtime-start-admission";

/** BackendManager-compatible named bot facade; it never launches an OS child. */
export class EngineBotBackend extends BackendManager {
  private readonly botId: string;
  private readonly agentId: string;
  private readonly controlToken = randomBytes(32).toString("hex");
  private readonly botListeners = new Set<(state: BackendState) => void>();
  private readonly workspaceDirectory: string;
  private botState: BackendState = {
    phase: "stopped",
    message: "The named bot is stopped.",
  };
  private botStartup: Promise<BackendState> | null = null;
  private botStopping: Promise<void> | null = null;
  private generation = 0;
  private owner: EngineClient | null = null;

  constructor(
    private readonly launchTarget: BackendLaunchTarget,
    private readonly botDataDir: string,
    workspaceDir: string,
    private readonly botFetch: typeof fetch,
    private readonly botOptions: BackendManagerOptions,
    private readonly currentEngine: () => EngineClient,
  ) {
    super(launchTarget, botDataDir, workspaceDir, botFetch, botOptions);
    if (
      !botOptions.expectedBotId ||
      !botOptions.expectedAgentId ||
      !botOptions.workerHostHandler ||
      !botOptions.isolatedEnvironment
    ) {
      throw new Error("Named bot engine configuration is incomplete.");
    }
    this.botId = botOptions.expectedBotId;
    this.agentId = botOptions.expectedAgentId;
    this.workspaceDirectory = workspaceDir;
  }

  override getState(): BackendState {
    return { ...this.botState };
  }

  override getWorkspaceDirectory(): string {
    return this.workspaceDirectory;
  }

  override hasLiveRuntime(): boolean {
    return this.owner !== null || this.botStartup !== null;
  }

  override subscribe(listener: (state: BackendState) => void): () => void {
    this.botListeners.add(listener);
    return () => this.botListeners.delete(listener);
  }

  override start(): Promise<BackendState> {
    if (!runtimeStartsAllowed()) return Promise.resolve(this.getState());
    if (this.botState.phase === "ready")
      return Promise.resolve(this.getState());
    if (this.botStopping) return this.botStopping.then(() => this.start());
    if (this.botStartup) return this.botStartup;
    const generation = ++this.generation;
    const startup = this.startNamed(generation).finally(() => {
      if (this.botStartup === startup) this.botStartup = null;
    });
    this.botStartup = startup;
    return startup;
  }

  private async startNamed(generation: number): Promise<BackendState> {
    this.publishBotState({
      phase: "booting",
      message: "Starting the named bot…",
    });
    try {
      const hostHandler = this.botOptions.workerHostHandler;
      if (!hostHandler)
        throw new Error("Named bot host grants are unavailable.");
      const engine = this.currentEngine();
      const environment = buildBackendEnvironment(
        this.botDataDir,
        this.launchTarget.repoRoot,
        this.workspaceDirectory,
        this.botOptions.isolatedEnvironment,
      );
      environment.DOOLITTLE_DESKTOP_CONTROL_TOKEN = this.controlToken;
      environment.DOOLITTLE_HOST_BOT_ID = this.botId;
      const exactEnvironment = Object.fromEntries(
        Object.entries(environment).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
      this.owner = engine;
      const result = await engine.startBot(
        this.botId,
        exactEnvironment,
        this.agentId,
        hostHandler,
        () => {
          if (this.owner !== engine) return;
          this.owner = null;
          this.botOptions.onHostDisconnect?.();
          this.publishBotState({
            phase: "degraded",
            message: "The named bot lost its shared engine connection.",
          });
        },
        this.botOptions.workerHostOnAbandonedResult,
      );
      if (this.owner !== engine)
        throw new Error("The shared engine disconnected.");
      if (generation !== this.generation) return this.getState();
      return this.publishBotState({
        phase: "ready",
        url: result.url,
        agentId: result.agentId,
        name: result.name,
        message: "Named bot ready",
      });
    } catch {
      if (generation !== this.generation) return this.getState();
      if (this.owner && !this.owner.hasBot(this.botId)) {
        this.owner = null;
        this.botOptions.onHostDisconnect?.();
      }
      return this.publishBotState({
        phase: "degraded",
        message: "The named bot could not start.",
        detail: "The shared engine could not start or verify this named bot.",
      });
    }
  }

  override async stop(updateState = true): Promise<void> {
    if (this.botStopping) return this.botStopping;
    this.generation++;
    this.botStopping = this.stopNamed(updateState).finally(() => {
      this.botStopping = null;
    });
    return this.botStopping;
  }

  private async stopNamed(updateState: boolean): Promise<void> {
    const startup = this.botStartup;
    const engine = this.owner;
    if (engine) {
      try {
        await this.stopAllOwnedExecutions();
      } catch {
        // Engine stop still drains the addressed worker.
      }
      try {
        await engine.stopBot(this.botId);
      } catch {
        this.publishBotState({
          phase: "degraded",
          message: "The named bot could not be stopped.",
          detail: "The shared engine did not confirm this bot stopped.",
        });
        throw new Error("The shared engine did not confirm this bot stopped.");
      }
      if (this.owner === engine) this.owner = null;
      this.botOptions.onHostDisconnect?.();
    }
    // A confirmed stop invalidates the old bootstrap even if its response is
    // delayed; its generation cannot publish over a later start.
    if (this.botStartup === startup) this.botStartup = null;
    if (updateState)
      this.publishBotState({
        phase: "stopped",
        message: "The named bot is stopped.",
      });
  }

  override async stopAllOwnedExecutions(): Promise<void> {
    const state = this.getState();
    if (!this.hasLiveRuntime() && state.phase !== "ready") return;
    if (!state.url)
      throw new Error("Named bot execution stop could not be confirmed.");
    const response = await this.botFetch(
      `${state.url}/runtime/executions/stop-all`,
      {
        method: "POST",
        headers: { "x-doolittle-desktop-control-token": this.controlToken },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) throw new Error("Named bot execution stop was rejected.");
    const result = (await response.json()) as { stopped?: unknown };
    if (result.stopped !== true)
      throw new Error("Named bot execution stop was not confirmed.");
  }

  override async restart(): Promise<BackendState> {
    await this.stop();
    return this.start();
  }

  override async switchWorkspace(workspaceDir: string): Promise<BackendState> {
    if (resolve(workspaceDir) !== resolve(this.workspaceDirectory))
      throw new Error(
        "Stop and update the named bot before changing its workspace.",
      );
    return this.getState();
  }

  private publishBotState(state: BackendState): BackendState {
    this.botState = state;
    for (const listener of this.botListeners) listener(this.getState());
    return this.getState();
  }
}
