import { type AgentRuntime, logger } from "@elizaos/core";

function formatShutdownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Stop the official Eliza runtime and close its database adapter.
 *
 * The pinned SDK's full `runtime/eliza` application barrel is not safe to
 * bundle into a desktop host: it eagerly reaches optional app-core, native,
 * and source-tree-only modules. Doolittle therefore uses the official narrow
 * plugin lifecycle export and keeps this process-level adapter closure at one
 * audited boundary until the SDK publishes a bundle-safe shutdown subpath.
 */
export async function shutdownElizaRuntime(
  runtime: AgentRuntime | null | undefined,
  context: string,
  options: { fast?: boolean } = {},
): Promise<void> {
  if (!runtime) return;

  let firstError: unknown;
  try {
    await runtime.stop(options.fast ? { fast: true } : undefined);
  } catch (error) {
    firstError = error;
    logger.warn(
      `[doolittle] ${context}: runtime stop failed: ${formatShutdownError(error)}`,
    );
  }

  const adapter = runtime.adapter;
  if (adapter && typeof adapter.close === "function") {
    try {
      await adapter.close();
    } catch (error) {
      firstError ??= error;
      logger.warn(
        `[doolittle] ${context}: database adapter close failed: ${formatShutdownError(error)}`,
      );
    }
  }

  if (firstError) throw firstError;
}
