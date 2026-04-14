import { getNativeEcosystemSnapshot } from "@/runtime/native/service-bridge/ownership";
import { getNativeTransportControlPlane } from "@/runtime/native/service-bridge/transport-control";
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

    if (trimmed === "/benchmarks packs") {
      return JSON.stringify(
        {
          packs: context.services.ecosystem.benchmarkPacks(),
        },
        null,
        2,
      );
    }

    if (trimmed === "/modeling profiles") {
      return JSON.stringify(
        {
          profiles: context.services.ecosystem.modelingProfiles(),
        },
        null,
        2,
      );
    }

    return undefined;
  };
