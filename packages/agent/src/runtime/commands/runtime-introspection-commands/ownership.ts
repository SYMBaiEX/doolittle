import { getNativeEcosystemSnapshot } from "@/runtime/native/service-bridge/ownership";
import {
  resolveOwnershipControlPlane,
  resolveOwnershipSnapshot,
} from "./shared";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleOwnershipRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed === "/runtime ownership") {
      return JSON.stringify(await resolveOwnershipSnapshot(context), null, 2);
    }

    if (trimmed === "/insights") {
      return JSON.stringify(
        {
          ownership: resolveOwnershipControlPlane(context),
          ecosystem: await getNativeEcosystemSnapshot(
            context.runtime,
            context.services,
            context.config,
            context.services.gatewayConfig,
          ),
          operator: await context.services.operator.setupSummary(),
        },
        null,
        2,
      );
    }

    return undefined;
  };
