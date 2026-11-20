import type { DeferredPluginGroupContext } from "./shared";

export async function loadDeferredTurnPlugins(
  context: DeferredPluginGroupContext,
) {
  const [{ loadDeferredExecutionPlugins }, { loadDeferredResearchPlugins }] =
    await Promise.all([import("./execution"), import("./research")]);
  return [
    ...loadDeferredResearchPlugins(context),
    ...loadDeferredExecutionPlugins(context),
  ];
}

export { loadDeferredMessagingPlugins } from "./messaging";
