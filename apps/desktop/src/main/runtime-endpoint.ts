import { randomBytes } from "node:crypto";
import type { BackendState } from "../shared/contracts";
import { readBoundedResponseText } from "./ipc/runtime-http";

/** Main-owned runtime state and execution control shared by processes and isolates. */
export abstract class RuntimeEndpoint {
  protected readonly controlToken = randomBytes(32).toString("hex");
  private readonly listeners = new Set<(state: BackendState) => void>();

  protected constructor(
    protected state: BackendState,
    protected readonly runtimeFetch: typeof fetch,
  ) {}

  abstract start(): Promise<BackendState>;
  abstract stop(): Promise<void>;
  abstract hasLiveRuntime(): boolean;
  abstract getWorkspaceDirectory(): string;

  getState(): BackendState {
    return { ...this.state };
  }

  subscribe(listener: (state: BackendState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  operatorInventoryHeaders(): Record<string, string> {
    return {};
  }

  protected update(state: BackendState): BackendState {
    this.state = state;
    for (const listener of this.listeners) listener(this.getState());
    return this.getState();
  }

  /** Credentials go directly to the owned runtime and never cross renderer IPC. */
  async stopAllOwnedExecutions(): Promise<void> {
    const state = this.getState();
    if (!this.hasLiveRuntime() && state.phase !== "ready") return;
    if (!state.url)
      throw new Error("Runtime execution stop could not be confirmed.");
    await this.stopExecutionsAt(state.url);
  }

  protected async stopExecutionsAt(url: string): Promise<void> {
    const signal = AbortSignal.timeout(5_000);
    const response = await this.runtimeFetch(
      `${url}/runtime/executions/stop-all`,
      {
        method: "POST",
        headers: { "x-doolittle-desktop-control-token": this.controlToken },
        signal,
      },
    );
    if (!response.ok)
      throw new Error(
        `Runtime execution stop failed (HTTP ${response.status}).`,
      );
    const result: unknown = JSON.parse(
      await readBoundedResponseText(response, 16_384, signal),
    );
    if (
      !result ||
      typeof result !== "object" ||
      !("stopped" in result) ||
      result.stopped !== true
    )
      throw new Error("Runtime did not confirm execution stop.");
  }
}
