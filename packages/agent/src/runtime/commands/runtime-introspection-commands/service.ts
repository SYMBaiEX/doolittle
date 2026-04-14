import { getNativeIntegrationControlPlane } from "@/runtime/native/service-bridge/control-planes";
import {
  renderRuntimeOperatorBlock,
  resolveOwnershipControlPlane,
} from "./shared";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleServiceRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime services" && trimmed !== "/services native") {
      return undefined;
    }

    const ownership = resolveOwnershipControlPlane(context);
    const integration = await getNativeIntegrationControlPlane(
      context.runtime,
      {
        web: context.services.web,
        mcp: context.services.mcp,
      },
    );
    const messaging = ownership.transportControl.messagingBridge ?? [];
    const transportInventory =
      ownership.transportControl.transportInventory ?? [];

    return renderRuntimeOperatorBlock(
      "Runtime Services",
      [
        `Resolution: ${ownership.serviceResolution.length} service binding(s)`,
        `Integration: browser=${integration.browser.source} mcp=${integration.mcp.source}`,
        `Messaging bridge: ${messaging.filter((entry) => entry.live).length}/${messaging.length} live`,
        `Transport inventory: ${transportInventory.filter((entry) => entry.operational).length}/${transportInventory.length} operational`,
        `Native registry groups: ${Object.keys(context.services.nativeRegistry).length}`,
      ],
      [
        "Use `/runtime plugins` for plugin inventory and packaging status.",
        "Use `/runtime ownership` when you need raw ownership details.",
      ],
    );
  };
