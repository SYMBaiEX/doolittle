import { appendBootstrapTrace } from "@/runtime/bootstrap/trace";
import type {
  AppContext,
  AppContextBuildOptions,
  AppContextOptions,
} from "@/runtime/bootstrap/types";

export type AppContextBuilder = (
  options: AppContextBuildOptions,
) => Promise<AppContext>;

export class AppContextManager {
  private contextPromise: Promise<AppContext> | undefined;
  private contextValue: AppContext | undefined;

  constructor(private readonly buildContext: AppContextBuilder) {}

  async get(options: AppContextOptions = {}): Promise<AppContext> {
    appendBootstrapTrace(
      "getAppContext:enter",
      `startupMode=${options.startupMode ?? "unset"} eager=${String(options.eagerDeferredHydration ?? "auto")}`,
    );

    const eagerDeferredHydration =
      options.eagerDeferredHydration ?? options.startupMode !== "cli";

    if (this.contextValue) {
      if (eagerDeferredHydration) {
        await this.contextValue.ensureDeferredHydration(options.startupMode);
      }
      return this.contextValue;
    }

    if (!this.contextPromise) {
      this.contextPromise = this.buildContext({
        startupMode: options.startupMode,
        eagerDeferredHydration,
      });
    }

    try {
      const resolved = await this.contextPromise;
      this.contextValue = resolved;
      if (eagerDeferredHydration) {
        await resolved.ensureDeferredHydration(options.startupMode);
      }
      appendBootstrapTrace("getAppContext:return");
      return resolved;
    } catch (error) {
      this.contextPromise = undefined;
      this.contextValue = undefined;
      throw error;
    }
  }

  reset(): void {
    this.contextPromise = undefined;
    this.contextValue = undefined;
  }
}
