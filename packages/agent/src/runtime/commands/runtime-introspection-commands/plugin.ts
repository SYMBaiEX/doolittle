import {
  getNativePluginCatalog,
  groupNativePluginCatalog,
} from "@/runtime/native/plugin-catalog";
import {
  renderRuntimeOperatorBlock,
  resolveOwnershipControlPlane,
} from "./shared";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handlePluginRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime plugins" && trimmed !== "/plugins native") {
      return undefined;
    }

    const catalog = getNativePluginCatalog(context.config);
    const ownership = resolveOwnershipControlPlane(context);
    const grouped = groupNativePluginCatalog(catalog);
    const categories = Object.entries(grouped).map(
      ([group, entries]) => `- ${group}: ${entries.length}`,
    );
    const pluginManager = ownership.pluginManager?.summary;

    return renderRuntimeOperatorBlock(
      "Runtime Plugins",
      [
        `Catalog: total=${catalog.length} categories=${categories.length}`,
        `Plugin manager: total=${pluginManager?.total ?? 0} enabled=${pluginManager?.enabled ?? 0} official=${pluginManager?.official ?? 0} vendored=${pluginManager?.vendored ?? 0}`,
        `Ownership resolution: ${ownership.serviceResolution.length}`,
        ...categories,
      ],
      [
        "Use `/runtime services` for the service-resolution side of the same runtime.",
        "Use `/runtime ownership` if you need the raw ownership snapshot.",
      ],
    );
  };
