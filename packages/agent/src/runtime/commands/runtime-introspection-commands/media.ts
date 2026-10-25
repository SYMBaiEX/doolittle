import { getNativeMediaControlPlane } from "../../native/service-bridge/control-planes/index";
import type { RuntimeIntrospectionCommandHandler } from "./types";

export const handleMediaRuntimeIntrospectionCommand: RuntimeIntrospectionCommandHandler =
  async (trimmed, context) => {
    if (trimmed !== "/runtime media") {
      return undefined;
    }

    return JSON.stringify(getNativeMediaControlPlane(context.runtime), null, 2);
  };
