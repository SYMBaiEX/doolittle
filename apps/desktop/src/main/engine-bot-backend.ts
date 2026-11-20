import type { BackendState } from "../shared/contracts";
import { type BackendManagerOptions, buildBackendEnvironment } from "./backend";
import type { EngineClient } from "./engine-client";
import { RuntimeEndpoint } from "./runtime-endpoint";
import { runtimeStartsAllowed } from "./runtime-start-admission";

/** Runtime endpoint for one isolate owned by the shared engine. */
export class EngineBotBackend extends RuntimeEndpoint {
  private readonly botId: string;
  private readonly agentId: string;
  private botStartup: Promise<BackendState> | null = null;
  private botStopping: Promise<void> | null = null;
  private generation = 0;
  private owner: EngineClient | null = null;

  constructor(
    private readonly repoRoot: string,
    private readonly botDataDir: string,
    private readonly workspaceDirectory: string,
    runtimeFetch: typeof fetch,
    private readonly botOptions: BackendManagerOptions,
    private readonly currentEngine: () => EngineClient,
  ) {
    super(
      { phase: "stopped", message: "The named bot is stopped." },
      runtimeFetch,
    );
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
  }

  override getWorkspaceDirectory(): string {
    return this.workspaceDirectory;
  }

  override hasLiveRuntime(): boolean {
    return this.owner !== null || this.botStartup !== null;
  }

  override start(): Promise<BackendState> {
    if (!runtimeStartsAllowed()) return Promise.resolve(this.getState());
    if (this.state.phase === "ready") return Promise.resolve(this.getState());
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
    this.update({
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
        this.repoRoot,
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
          this.update({
            phase: "degraded",
            message: "The named bot lost its shared engine connection.",
          });
        },
        this.botOptions.workerHostOnAbandonedResult,
      );
      if (this.owner !== engine)
        throw new Error("The shared engine disconnected.");
      if (generation !== this.generation) return this.getState();
      return this.update({
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
      return this.update({
        phase: "degraded",
        message: "The named bot could not start.",
        detail: "The shared engine could not start or verify this named bot.",
      });
    }
  }

  override async stop(): Promise<void> {
    if (this.botStopping) return this.botStopping;
    this.generation++;
    this.botStopping = this.stopNamed().finally(() => {
      this.botStopping = null;
    });
    return this.botStopping;
  }

  private async stopNamed(): Promise<void> {
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
        this.update({
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
    this.update({
      phase: "stopped",
      message: "The named bot is stopped.",
    });
  }
}
