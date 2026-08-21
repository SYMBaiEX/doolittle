/**
 * The packaged desktop runtime is distributed as one minified JavaScript
 * bundle. Optional connectors whose dependency closure is not compatible with
 * that distribution are kept available to source/CLI installs, but omitted
 * from the desktop artifact at build time.
 *
 * `prepare-runtime.ts` replaces this exact environment expression with a
 * literal so esbuild can remove the guarded dynamic imports and their complete
 * dependency closures. Do not replace it with a runtime-only configuration
 * lookup: that would leave the optional packages in the shipped bundle.
 */
export const IS_DISTRIBUTED_DESKTOP_RUNTIME =
  process.env.DOOLITTLE_DISTRIBUTED_DESKTOP_RUNTIME === "1";

export const DISTRIBUTED_DESKTOP_OMITTED_MESSAGING_PLUGINS = [
  "@elizaos/plugin-telegram",
  "@elizaos/plugin-whatsapp",
] as const;

export function distributedDesktopIncludesMessagingPlugin(
  packageName: string,
): boolean {
  return (
    !IS_DISTRIBUTED_DESKTOP_RUNTIME ||
    !DISTRIBUTED_DESKTOP_OMITTED_MESSAGING_PLUGINS.some(
      (omitted) => omitted === packageName,
    )
  );
}
