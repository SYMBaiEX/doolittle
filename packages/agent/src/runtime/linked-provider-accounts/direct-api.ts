import type { IAgentRuntime } from "@elizaos/core";
import { ensureActiveDirectApiAccountCredentials } from "../native/account-pool";
import { ensureDoolittleDirectApiPlugins } from "../native/plugin-registry/providers";
import { withLinkedProviderMutationLock } from "./mutation-lock";

export function deferDesktopDirectApiCredentials(): boolean {
  return (
    process.platform === "darwin" &&
    (process.env.DOOLITTLE_DESKTOP_RUNTIME === "1" ||
      process.env.DOOLITTLE_NATIVE_RUNTIME === "1")
  );
}

/** Keep managed-key access tied to an actual request for the selected model. */
export async function prepareDesktopDirectApiCredentials(
  runtime: IAgentRuntime,
  provider: string,
  signal?: AbortSignal,
): Promise<void> {
  if (
    !deferDesktopDirectApiCredentials() ||
    process.env.DOOLITTLE_BOT_RUNTIME === "worker" ||
    (provider !== "openai" && provider !== "anthropic")
  ) {
    return;
  }
  await withLinkedProviderMutationLock(runtime, async () => {
    signal?.throwIfAborted();
    await ensureActiveDirectApiAccountCredentials(provider);
    signal?.throwIfAborted();
    if (provider === "openai") await ensureDoolittleDirectApiPlugins(runtime);
  });
}
