import { getNativeEcosystemSnapshot } from "../../native/service-bridge/ownership/index";
import { getNativeTransportControlPlane } from "../../native/service-bridge/transport-control/index";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleEcosystemRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (
      trimmed === "/runtime ecosystem" ||
      trimmed === "/plugins ecosystem" ||
      trimmed === "/runtime ecosystem refresh"
    ) {
      const refresh = trimmed.endsWith(" refresh");
      return JSON.stringify(
        await getNativeEcosystemSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
          refresh,
        ),
        null,
        2,
      );
    }

    if (trimmed === "/ecosystem" || trimmed === "/ecosystem packages") {
      return JSON.stringify(
        await getNativeEcosystemSnapshot(
          context.runtime,
          context.services,
          context.config,
          context.services.gatewayConfig,
        ),
        null,
        2,
      );
    }

    if (trimmed === "/runtime transports") {
      return JSON.stringify(
        getNativeTransportControlPlane(
          context.runtime,
          context.config,
          context.services.gatewayConfig,
        ),
        null,
        2,
      );
    }

    return undefined;
  };
