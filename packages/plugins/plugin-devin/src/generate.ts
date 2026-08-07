import {
  getRuntimeModelSettings,
  getRuntimeProvider,
  normalizeProviderTransportError,
  ProviderTransportError,
  resolveModelPromptText,
} from "@doolittle/provider-transport";
import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import {
  DEFAULT_DEVIN_COMMAND,
  DEFAULT_DEVIN_MODEL,
  DEFAULT_DEVIN_TIMEOUT_MS,
  invokeDevinCliPrint,
} from "./cli";
import type { DevinPluginOptions } from "./types";

export async function runDevinTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: DevinPluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "devin") {
    throw new ProviderTransportError(
      `Devin model handler is active, but runtime provider is ${provider}. Restart with the Devin provider selected to use this plugin directly.`,
      {
        code: "incompatible_provider",
        provider: "devin",
        detail: provider,
      },
    );
  }

  const status = options.getStatus();
  const ready = status.nativeReady ?? status.reusable ?? status.fallbackReady;
  if (!ready) {
    throw new ProviderTransportError(
      "No reusable linked Devin CLI session is available. Run `devin auth login`, then `/accounts connect devin`.",
      {
        code: "no_credentials",
        provider: "devin",
      },
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const model = runtimeModel.model || options.model || DEFAULT_DEVIN_MODEL;
  const promptText = resolveModelPromptText(params);
  const startedAt = Date.now();
  try {
    const output = await (options.invokeCliPrint ?? invokeDevinCliPrint)({
      prompt: promptText,
      model,
      command: options.command || DEFAULT_DEVIN_COMMAND,
      cwd: options.getCwd?.() ?? options.cwd,
      timeoutMs: options.timeoutMs ?? DEFAULT_DEVIN_TIMEOUT_MS,
      permissionMode: "auto",
    });
    runtime.logger?.info(
      {
        model,
        promptChars: promptText.length,
        elapsedMs: Date.now() - startedAt,
      },
      "[DOOLITTLE:DEVIN] Devin generate complete",
    );
    return output?.trim() || "No response returned.";
  } catch (error) {
    runtime.logger?.warn(
      {
        error,
        model,
        promptChars: promptText.length,
        elapsedMs: Date.now() - startedAt,
      },
      "[DOOLITTLE:DEVIN] Devin generate failed",
    );
    throw normalizeProviderTransportError("devin", "CLI request", error);
  }
}
