import { getAutonomousControlPlane } from "@/runtime/native/service-bridge/autonomous";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleAutonomousRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime autonomous") {
      return undefined;
    }

    return JSON.stringify(
      getAutonomousControlPlane(
        context.runtime,
        context.services,
        context.config,
      ),
      null,
      2,
    );
  };
