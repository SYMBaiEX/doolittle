import { getNativeResearchControlPlane } from "@/runtime/native/service-bridge/control-planes";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleResearchRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime research") {
      return undefined;
    }

    return JSON.stringify(
      getNativeResearchControlPlane(context.runtime),
      null,
      2,
    );
  };
